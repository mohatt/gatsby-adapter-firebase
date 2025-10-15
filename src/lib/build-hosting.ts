import type { RoutesManifest } from 'gatsby'
import {
  HeaderKV,
  FirebaseHostingHeader,
  FirebaseHostingRedirect,
  FirebaseHostingRewrite,
  FirebaseHostingFunctionRewrite,
  FirebaseHostingJson,
  FunctionDeployment,
} from './types.js'
import type { FunctionConfig } from './runtime/types.js'
import type { AdaptorReporter } from './reporter.js'

export interface BuildHostingOptions {
  hostingTarget: string
}

export interface BuildHostingArgs {
  routesManifest: RoutesManifest
  pathPrefix: string
  options: BuildHostingOptions
  reporter: AdaptorReporter
  functionsMap?: ReadonlyMap<
    string,
    {
      default: Pick<FunctionDeployment, 'deployId' | 'config'>
      cached?: Pick<FunctionDeployment, 'deployId' | 'config'>
    }
  >
}

export interface BuildHostingResult {
  config: FirebaseHostingJson
}

const ensureLeadingSlash = (value: string) => {
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

const splitLocation = (value: string): [path: string, suffix: string] => {
  if (!value) return ['', '']
  const index = value.search(/[?#]/)
  if (index === -1) return [value, '']
  return [value.slice(0, index), value.slice(index)]
}

const applyPathPrefix = (value: string, pathPrefix: string) => {
  if (!pathPrefix) return value
  const prefix = ensureLeadingSlash(pathPrefix).replace(/\/$/, '')
  if (!prefix || prefix === '/') return value
  if (value === '/') return prefix
  if (value.startsWith(`${prefix}/`) || value === prefix) return value
  // collapse slashes
  return `${prefix}${value}`.replace(/\/{2,}/g, '/')
}

interface RedirectTransformResult {
  source: string
  destination?: string
  destinationSuffix?: string
  isExternal?: boolean
}

const transformRedirect = (fromPath: string, toPath?: string): RedirectTransformResult => {
  const sourceSegments = ensureLeadingSlash(fromPath).split('/')
  const hasDestination = toPath != null
  const wildcardNames: string[] = []

  const wildcardNameAt = (index: number) => (index === 0 ? 'splat' : `splat${index}`)
  const sourceTransformed = sourceSegments.map((segment, index) => {
    if (index === 0) return segment
    if (segment === '*') {
      if (!hasDestination) return '**'
      const name = wildcardNameAt(wildcardNames.length)
      wildcardNames.push(name)
      return `:${name}*`
    }
    return segment
  })

  const source = sourceTransformed.join('/').replace(/\/{2,}/g, '/')

  if (!hasDestination) {
    return { source }
  }

  let destinationPattern: string | undefined
  let destinationSuffix: string | undefined
  let destinationOrigin: string | undefined
  let isExternal = false

  if (/^https?:\/\//i.test(toPath)) {
    isExternal = true
    try {
      const parsed = new URL(toPath)
      destinationOrigin = `${parsed.protocol}//${parsed.host}`
      destinationPattern = parsed.pathname
      destinationSuffix = `${parsed.search}${parsed.hash}`
    } catch {
      ;[destinationPattern, destinationSuffix] = splitLocation(toPath)
    }
  } else {
    ;[destinationPattern, destinationSuffix] = splitLocation(toPath)
  }

  const destinationSegments = ensureLeadingSlash(destinationPattern).split('/')
  let wildcardIndex = 0

  const destinationTransformed = destinationSegments.map((segment, index) => {
    if (index === 0) return segment
    if (segment === '*') {
      const name =
        wildcardNames[wildcardIndex] ??
        // fallback for mismatched wildcards to keep rule valid (value will be empty)
        wildcardNameAt(wildcardIndex)
      wildcardIndex += 1
      return `:${name}`
    }
    return segment
  })

  const destinationPath = destinationTransformed.join('/').replace(/\/{2,}/g, '/')

  return {
    source,
    destination: `${destinationOrigin ?? ''}${destinationPath}`,
    destinationSuffix,
    isExternal,
  }
}

const normalizeRoutePath = (value: string, pathPrefix: string) => {
  let base = ensureLeadingSlash(value)
  if (base.startsWith('/static/')) {
    // ensure no trailing slash in static asset paths since sometimes gatsby
    // provides paths like /static/xxxx/image.png/ which is not valid
    base = base.replace(/\/+$/u, '')
  }
  const prefixed = applyPathPrefix(base, pathPrefix)
  // convert trailing wildcard to /** for Firebase
  // usually only redirect routes contain wildcards, but just in case
  return prefixed.replace(/\/\*$/u, '/**')
}

const routePathToOptionalSlashRegex = (path: string) => {
  if (!path || path === '/') return '^/$'

  let pattern = ''
  let i = 0
  const len = path.length

  while (i < len) {
    const char = path[i]
    if (char === '*') {
      if (path[i + 1] === '*') {
        pattern += '.*' // match any depth
        i += 1
      } else {
        pattern += '[^/]*' // match one path segment
      }
    } else {
      // escape regex
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    i += 1
  }

  // remove duplicate slashes and normalize trailing behavior
  pattern = pattern.replace(/\/+$/, '')

  // allow optional trailing slash for all routes (Firebase behavior)
  return `^${pattern}(?:/)?$`
}

const extractRegion = (config?: FunctionConfig): string | null => {
  const region = config?.region
  if (!region) return null
  if (typeof region === 'string') return region
  if (Array.isArray(region)) return region[0]
  if (region && 'value' in region && typeof region.value === 'function') return region.value()
  return null
}

export const buildHosting = (args: BuildHostingArgs): BuildHostingResult => {
  const { routesManifest, pathPrefix, reporter, functionsMap, options } = args
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
    const [routePath, routeSuffix] = splitLocation(route.path)
    const source = normalizeRoutePath(routePath, pathPrefix)

    if (route.type === 'function') {
      const variants = functionsMap!.get(route.functionId)
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
      const { deployId, config } =
        route.cache && variants.cached //
          ? variants.cached
          : variants.default
      const destination: FirebaseHostingFunctionRewrite['function'] = {
        functionId: deployId,
        // pinTag causes firebase deploy to fail sometimes
        // pinTag: true,
      }
      const region = extractRegion(config)
      if (region) destination.region = region
      rewrites.push(
        source.endsWith('/page-data.json') // account for pathPrefix
          ? { source, function: destination }
          : {
              // Firebase is strict about trailing slashes, so we need to use regex here so
              // that function routes match both with and without a trailing slash
              regex: routePathToOptionalSlashRegex(source),
              function: destination,
            },
      )
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

      if (route.toPath == null) {
        reporter.warn(
          `Redirect ${route.path} is missing a \`toPath\` which Firebase Hosting requires; skipping.`,
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

      let destination = route.toPath
      const redirect = transformRedirect(routePath, destination)
      const redirectSource = applyPathPrefix(redirect.source, pathPrefix)

      if (redirect.destination) {
        destination = redirect.isExternal
          ? `${redirect.destination}${redirect.destinationSuffix}`
          : `${applyPathPrefix(redirect.destination, pathPrefix)}${redirect.destinationSuffix}`
      }

      if (route.status === 200) {
        if (redirect.isExternal) {
          reporter.warn(
            `Rewrite ${route.path} -> ${route.toPath} targets an external URL; Firebase Hosting rewrites cannot proxy to external origins. Falling back to 302 redirect.`,
          )
          redirects.push({ source: redirectSource, destination, type: 302 })
        } else {
          rewrites.push({ source: redirectSource, destination })
        }
        continue
      }

      if (route.status !== 301 && route.status !== 302) {
        reporter.warn(
          `Redirect ${route.path} -> ${route.toPath} uses unsupported status ${route.status}; skipping.`,
        )
        continue
      }

      redirects.push({
        destination,
        source: redirectSource,
        type: route.status,
      })
    }
  }

  // map to headers array
  const headers: FirebaseHostingHeader[] = Array.from(headerAccumulator.entries())
    .map(([source, headerMap]) => ({ source, headers: Array.from(headerMap.values()) }))
    .sort((a, b) => a.source.localeCompare(b.source))

  return {
    config: {
      target: options.hostingTarget,
      public: 'public',
      redirects,
      rewrites,
      headers,
    },
  }
}
