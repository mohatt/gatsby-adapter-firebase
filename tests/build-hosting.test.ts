import { describe, expect, it, vi } from 'vitest'
import type { RoutesManifest } from 'gatsby'
import type { FunctionVariants } from '../src/lib/types.js'
import { buildHosting } from '../src/lib/build-hosting.js'
import { AdaptorReporter } from '../src/lib/reporter.js'

const createReporter = () => {
  const gatsbyReporter = {
    warn: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    panic: vi.fn().mockImplementation((err) => {
      throw err
    }),
    activityTimer: () => ({
      start: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      panic: vi.fn().mockImplementation((err) => {
        throw err
      }),
    }),
    setErrorMap: vi.fn(),
  } as unknown as import('gatsby').Reporter

  return { adaptor: new AdaptorReporter(gatsbyReporter), gatsby: gatsbyReporter }
}

describe('buildHosting()', () => {
  it('converts Gatsby routes into Firebase hosting rules', () => {
    const routes: RoutesManifest = [
      { type: 'function', path: '/ssr', functionId: 'ssr-engine' },
      { type: 'function', path: '/ssr-deferred', functionId: 'ssr-engine', cache: true },
      { type: 'redirect', path: '/docs/*', toPath: '/docs/index', status: 200, headers: [] },
      { type: 'redirect', path: '/old', toPath: '/new', status: 301, headers: [] },
      { type: 'redirect', path: '/legacy?tag=:id', toPath: '/blog/:id', status: 301, headers: [] },
      {
        type: 'static',
        path: '/static',
        filePath: 'public/static.html',
        headers: [{ key: 'cache-control', value: 'public, max-age=0' }],
      },
    ]

    const { adaptor: reporter, gatsby } = createReporter()
    const functionsMap = new Map<string, FunctionVariants>()
    functionsMap.set('ssr-engine', {
      default: { id: 'ssr-engine', deployId: 'ssr_engine', variant: 'default', entryFile: 'xx' },
      cached: {
        id: 'ssr-engine-cached',
        deployId: 'ssr_engine_cached',
        variant: 'cached',
        entryFile: 'xx',
      },
    })

    const { rewrites, redirects, headers } = buildHosting({
      routesManifest: routes,
      pathPrefix: '',
      reporter,
      functionsMap,
    })

    expect(rewrites).toEqual([
      {
        source: '/ssr',
        function: { functionId: 'ssr_engine', pinTag: true },
      },
      {
        source: '/ssr-deferred',
        function: { functionId: 'ssr_engine_cached', pinTag: true },
      },
      {
        source: '/docs/**',
        destination: '/docs/index',
      },
    ])

    expect(redirects).toEqual([
      {
        source: '/old',
        destination: '/new',
        type: 301,
      },
    ])

    expect(headers).toEqual([
      {
        source: '/static',
        headers: [{ key: 'cache-control', value: 'public, max-age=0' }],
      },
    ])

    expect(gatsby.warn).toHaveBeenCalledWith(
      expect.stringContaining('contains query parameters or hash fragments'),
    )
  })

  it('derives rewrite region from config overrides with fallback to defaults', () => {
    const routes: RoutesManifest = [
      { type: 'function', path: '/ssr', functionId: 'ssr-engine' },
      { type: 'function', path: '/api', functionId: 'hello-world' },
    ]

    const { adaptor: reporter } = createReporter()
    const functionsMap = new Map<string, FunctionVariants>()
    functionsMap.set('ssr-engine', {
      default: {
        id: 'ssr-engine',
        deployId: 'ssr_engine',
        variant: 'default',
        entryFile: 'xx',
        config: { region: 'asia-northeast1' },
      },
      cached: {
        id: 'ssr-engine-cached',
        deployId: 'ssr_engine_cached',
        variant: 'cached',
        entryFile: 'xx',
        config: { region: 'europe-west1' },
      },
    })
    functionsMap.set('hello-world', {
      default: {
        id: 'hello-world',
        deployId: 'hello_world',
        variant: 'default',
        entryFile: 'yy',
        config: { region: 'europe-west1' },
      },
    })

    const { rewrites } = buildHosting({
      routesManifest: routes,
      pathPrefix: '',
      reporter,
      functionsMap,
    })

    expect(rewrites).toEqual([
      {
        source: '/ssr',
        function: { functionId: 'ssr_engine', pinTag: true, region: 'asia-northeast1' },
      },
      {
        source: '/api',
        function: { functionId: 'hello_world', pinTag: true, region: 'europe-west1' },
      },
    ])
  })

  it('warns when cached route has no cached variant', () => {
    const routes: RoutesManifest = [
      { type: 'function', path: '/dsg', functionId: 'ssr-engine', cache: true },
    ]

    const { adaptor: reporter, gatsby } = createReporter()
    const functionsMap = new Map<string, FunctionVariants>()
    functionsMap.set('ssr-engine', {
      default: { id: 'ssr-engine', deployId: 'ssr_engine', variant: 'default', entryFile: 'xx' },
    })

    const { rewrites } = buildHosting({
      routesManifest: routes,
      pathPrefix: '',
      reporter,
      functionsMap,
    })

    expect(rewrites).toEqual([
      {
        source: '/dsg',
        function: { functionId: 'ssr_engine', pinTag: true },
      },
    ])

    expect(gatsby.warn).toHaveBeenCalledWith(
      expect.stringContaining('cache=true but cached variant could not be generated'),
    )
  })
})
