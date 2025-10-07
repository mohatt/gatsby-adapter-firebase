import type { RoutesManifest } from 'gatsby'
import {
  HeaderKV,
  FirebaseHostingHeader,
  FirebaseHostingRedirect,
  FirebaseHostingRewrite,
  FirebaseHostingFunctionRewrite,
  FunctionVariants,
} from './types.js'
import type { FunctionConfig } from './runtime/types.js'
import type { AdaptorReporter } from './reporter.js'

export interface BuildHostingArgs {
  routesManifest: RoutesManifest
  pathPrefix: string
  reporter: AdaptorReporter
  functionsMap: ReadonlyMap<string, FunctionVariants>
}

export interface BuildHostingResult {
  headers: FirebaseHostingHeader[]
  redirects: FirebaseHostingRedirect[]
  rewrites: FirebaseHostingRewrite[]
}

const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308]

const ensureLeadingSlash = (value: string) => {
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

const splitLocation = (value: string) => {
  if (!value) return { path: '', suffix: '' }
  const index = value.search(/[?#]/)
  if (index === -1) return { path: value, suffix: '' }
  return {
    path: value.slice(0, index),
    suffix: value.slice(index),
  }
}

const applyPathPrefix = (value: string, pathPrefix: string) => {
  if (!pathPrefix) return value
  const normalizedPrefix = ensureLeadingSlash(pathPrefix).replace(/\/$/, '')
  if (!normalizedPrefix || normalizedPrefix === '/') {
    return value
  }

  if (value === '/') {
    return normalizedPrefix
  }

  if (value.startsWith(`${normalizedPrefix}/`) || value === normalizedPrefix) {
    return value
  }

  // collapse slashes
  return `${normalizedPrefix}${value}`.replace(/\/{2,}/g, '/')
}

const normalizeSource = (value: string, pathPrefix: string) => {
  const base = ensureLeadingSlash(value || '/')
  const prefixed = applyPathPrefix(base, pathPrefix)
  return prefixed.replace(/\/\*$/u, '/**') || '/'
}

const normalizeDestination = (value: string, pathPrefix: string) => {
  const { path, suffix } = splitLocation(value)
  const normalizedPath = applyPathPrefix(ensureLeadingSlash(path || '/'), pathPrefix) || '/'
  const collapsed = normalizedPath.replace(/\/{2,}/g, '/')
  return `${collapsed}${suffix ?? ''}`
}

const extractRegion = (options?: FunctionConfig): string | null => {
  if (!options) return null
  const region = options?.region
  if (typeof region === 'string') return region
  if (Array.isArray(region)) return region[0]
  if (region && 'value' in region && typeof region.value === 'function') return region.value()
  return null
}

export const buildHosting = (args: BuildHostingArgs): BuildHostingResult => {
  const { routesManifest, pathPrefix, reporter, functionsMap } = args
  const headerAccumulator = new Map<string, Map<string, HeaderKV>>()
  const redirects: FirebaseHostingRedirect[] = []
  const rewrites: FirebaseHostingRewrite[] = []

  const addHeaders = (source: string, entries: HeaderKV[]) => {
    if (!entries.length) return
    let bucket = headerAccumulator.get(source)
    if (!bucket) {
      bucket = new Map()
      headerAccumulator.set(source, bucket)
    }
    for (const { key, value } of entries) {
      bucket.set(key.toLowerCase(), { key, value })
    }
  }

  for (const route of routesManifest) {
    const { path: routePath, suffix: routeSuffix } = splitLocation(route.path)
    const source = normalizeSource(routePath, pathPrefix)

    if (route.type === 'function') {
      const variants = functionsMap.get(route.functionId)
      if (!variants) {
        reporter.warn(
          `Function route ${route.path} -> "${route.functionId}" has no matching function definition; skipping rewrite for ${source}`,
        )
        continue
      }
      if (route.cache && !variants.cached) {
        reporter.warn(
          `Function route ${route.path} -> "${route.functionId}" is marked cache=true but cached variant could not be generated; using default deployment.`,
        )
      }
      const functionEntry = route.cache && variants.cached ? variants.cached : variants.default
      const { deployId, config } = functionEntry
      const region = extractRegion(config)

      const rewrite: FirebaseHostingFunctionRewrite = {
        source,
        function: {
          functionId: deployId,
          pinTag: true,
          ...(region ? { region } : {}),
        },
      }
      rewrites.push(rewrite)
      continue
    }

    if (route.type === 'static') {
      addHeaders(source, route.headers)
      continue
    }

    if (route.type === 'redirect') {
      if (routeSuffix) {
        reporter.warn(
          `Redirect "${route.path}" -> "${route.toPath}" contains query parameters or hash fragments which Firebase Hosting cannot match; skipping this rule.`,
        )
        continue
      }

      if (route.headers?.length) {
        reporter.warn(
          `Redirect ${route.path} -> ${route.toPath} defines HTTP headers but Firebase Hosting redirects do not support response headers; omitting headers.`,
        )
      }
      if (route.ignoreCase) {
        reporter.warn(
          `Redirect ${route.path} -> ${route.toPath} sets ignoreCase=true which is not supported by Firebase Hosting; proceeding with case-sensitive match.`,
        )
      }
      const conditions = route['conditions'] as Record<string, unknown> | undefined
      if (conditions && Object.keys(conditions).length > 0) {
        reporter.warn(
          `Redirect ${route.path} -> ${route.toPath} has conditions (${Object.keys(conditions).join(', ')}) which are not supported by Firebase Hosting; skipping rewrite for ${source}`,
        )
        continue
      }

      const isExternal = /^https?:\/\//i.test(route.toPath)
      const destination = isExternal ? route.toPath : normalizeDestination(route.toPath, pathPrefix)

      if (route.status === 200) {
        if (isExternal) {
          reporter.warn(
            `Rewrite ${route.path} -> ${route.toPath} targets an external URL; Firebase Hosting rewrites cannot proxy to external origins. Falling back to 302 redirect.`,
          )
          redirects.push({ source, destination: route.toPath, type: 302 })
        } else {
          rewrites.push({ source, destination })
        }
        continue
      }

      if (!REDIRECT_STATUS_CODES.includes(route.status)) {
        reporter.warn(
          `Redirect ${route.path} -> ${route.toPath} uses unsupported status ${route.status}; skipping.`,
        )
        continue
      }

      redirects.push({
        source,
        destination,
        type: route.status,
      })
    }
  }

  // map to headers array
  const headers: FirebaseHostingHeader[] = Array.from(headerAccumulator.entries())
    .map(([source, headerMap]) => ({ source, headers: Array.from(headerMap.values()) }))
    .sort((a, b) => a.source.localeCompare(b.source))

  return { headers, redirects, rewrites }
}
