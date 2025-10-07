import { describe, expect, it, vi } from 'vitest'
import type { RoutesManifest } from 'gatsby'
import { transformRoutes } from '../src/lib/routes-transform.js'
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

describe('transformRoutes', () => {
  it('converts Gatsby routes into Firebase hosting rules', () => {
    const routes: RoutesManifest = [
      { type: 'function', path: '/ssr', functionId: 'ssr-engine' },
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

    const { rewrites, redirects, headers } = transformRoutes({
      routes,
      pathPrefix: '',
      reporter,
      functionIdMap: new Map([['ssr-engine', 'ssr_engine']]),
    })

    expect(rewrites).toEqual([
      {
        source: '/ssr',
        function: { functionId: 'ssr_engine', pinTag: true },
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

    const { rewrites } = transformRoutes({
      routes,
      pathPrefix: '',
      reporter,
      functionIdMap: new Map([
        ['ssr-engine', 'ssr_engine'],
        ['hello-world', 'hello_world'],
      ]),
      functionsConfig: { region: 'europe-west1' },
      functionsConfigOverride: {
        'ssr-engine': { region: 'asia-northeast1' },
      },
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
})
