import type { RoutesManifest, Reporter } from 'gatsby'
import type { HeaderKV, HostingHeader, HostingRedirect, HostingRewrite } from './types.js'

export interface TransformRoutesOptions {
  routes: RoutesManifest
  pathPrefix: string
  reporter: Reporter
  functionIdMap: Map<string, string>
  region: string
}

export interface TransformRoutesResult {
  headers: HostingHeader[]
  redirects: HostingRedirect[]
  rewrites: HostingRewrite[]
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

export const transformRoutes = (options: TransformRoutesOptions): TransformRoutesResult => {
  const { routes, pathPrefix, reporter, functionIdMap, region } = options

  const headerAccumulator = new Map<string, Map<string, HeaderKV>>()

  const addHeaders = (source: string, entries: HeaderKV[]) => {
    if (!entries.length) return
    const { path } = splitLocation(source)
    const normalizedSource = normalizeSource(path, pathPrefix)
    let bucket = headerAccumulator.get(normalizedSource)
    if (!bucket) {
      bucket = new Map()
      headerAccumulator.set(normalizedSource, bucket)
    }
    for (const { key, value } of entries) {
      bucket.set(key.toLowerCase(), { key, value })
    }
  }

  const redirects: HostingRedirect[] = []
  const rewrites: HostingRewrite[] = []

  for (const route of routes) {
    const { path: routePath, suffix: routeSuffix } = splitLocation(route.path)

    if (routeSuffix) {
      reporter.warn(
        `[gatsby-adapter-firebase] Route "${route.path}" contains query parameters or hash fragments which Firebase Hosting cannot match; skipping this rule.`,
      )
      continue
    }

    const source = normalizeSource(routePath, pathPrefix)

    if (route.type === 'static') {
      addHeaders(routePath, route.headers)
      continue
    }

    if (route.type === 'function') {
      const deployedId = functionIdMap.get(route.functionId)
      if (!deployedId) {
        reporter.warn(
          `[gatsby-adapter-firebase] Function route for id "${route.functionId}" has no matching function definition; skipping rewrite for ${source}`,
        )
        continue
      }
      rewrites.push({
        source,
        function: { functionId: deployedId, region, pinTag: true },
      })
      continue
    }

    if (route.type === 'redirect') {
      if (route.headers?.length) {
        reporter.warn(
          `[gatsby-adapter-firebase] Redirect for ${route.path} defines HTTP headers but Firebase Hosting redirects do not support response headers; omitting headers.`,
        )
      }
      if (route.ignoreCase) {
        reporter.warn(
          `[gatsby-adapter-firebase] Redirect for ${route.path} sets ignoreCase=true which is not supported by Firebase Hosting; proceeding with case-sensitive match.`,
        )
      }
      const conditions = route['conditions'] as Record<string, unknown> | undefined
      if (conditions && Object.keys(conditions).length > 0) {
        reporter.warn(
          `[gatsby-adapter-firebase] Redirect for ${route.path} has conditions (${Object.keys(conditions).join(', ')}) which are not supported by Firebase Hosting; skipping rewrite for ${source}`,
        )
        continue
      }

      const isExternal = /^https?:\/\//i.test(route.toPath)
      const destination = isExternal ? route.toPath : normalizeDestination(route.toPath, pathPrefix)

      if (route.status === 200) {
        if (isExternal) {
          reporter.warn(
            `[gatsby-adapter-firebase] Gatsby rewrite ${route.path} -> ${route.toPath} targets an external URL; Firebase Hosting rewrites cannot proxy to external origins. Falling back to 302 redirect.`,
          )
          redirects.push({ source, destination: route.toPath, type: 302 })
        } else {
          rewrites.push({ source, destination })
        }
        continue
      }

      if (!REDIRECT_STATUS_CODES.includes(route.status)) {
        reporter.warn(
          `[gatsby-adapter-firebase] Redirect for ${route.path} uses unsupported status ${route.status}; skipping.`,
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
  const headers: HostingHeader[] = Array.from(headerAccumulator.entries())
    .map(([source, headerMap]) => ({ source, headers: Array.from(headerMap.values()) }))
    .sort((a, b) => a.source.localeCompare(b.source))

  return { headers, redirects, rewrites }
}
