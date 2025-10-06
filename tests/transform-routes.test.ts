import { describe, expect, it, vi } from 'vitest'
import type { Reporter, RoutesManifest } from 'gatsby'
import { transformRoutes } from '../src/lib/routes-transform.js'

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

    const reporter = { warn: vi.fn() } as unknown as Reporter

    const { rewrites, redirects, headers } = transformRoutes({
      routes,
      pathPrefix: '',
      reporter,
      functionIdMap: new Map([['ssr-engine', 'ssr_engine']]),
      region: 'us-central1',
    })

    expect(rewrites).toEqual([
      {
        source: '/ssr',
        function: { functionId: 'ssr_engine', pinTag: true, region: 'us-central1' },
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

    expect(reporter.warn).toHaveBeenCalledWith(
      expect.stringContaining('contains query parameters or hash fragments'),
    )
  })
})
