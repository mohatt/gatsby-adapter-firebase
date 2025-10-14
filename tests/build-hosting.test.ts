import { createTestArgs } from '../test/util.js'
import { buildHosting, BuildHostingArgs } from '../src/lib/build-hosting.js'

describe('buildHosting()', () => {
  it('converts Gatsby routes into Firebase hosting rules', () => {
    const args = createTestArgs<BuildHostingArgs>({
      routesManifest: [
        { type: 'function', path: '/ssr', functionId: 'ssr-engine' },
        { type: 'function', path: '/ssr-deferred', functionId: 'ssr-engine', cache: true },
        { type: 'redirect', path: '/docs/*', toPath: '/docs/index', status: 200, headers: [] },
        { type: 'redirect', path: '/old', toPath: '/new', status: 301, headers: [] },
        {
          type: 'redirect',
          path: '/legacy?tag=:id',
          toPath: '/blog/:id',
          status: 301,
          headers: [],
        },
        {
          type: 'static',
          path: '/static',
          filePath: 'public/static.html',
          headers: [{ key: 'cache-control', value: 'public, max-age=0' }],
        },
      ],
      functionsMap: new Map([
        [
          'ssr-engine',
          {
            default: { deployId: 'ssr_engine', config: {} },
            cached: { deployId: 'ssr_engine_cached', config: {} },
          },
        ],
      ]),
      pathPrefix: '',
    })
    const { config } = buildHosting(args)

    expect(config.rewrites).toEqual([
      {
        regex: '^/ssr(?:/)?$',
        function: { functionId: 'ssr_engine' },
      },
      {
        regex: '^/ssr-deferred(?:/)?$',
        function: { functionId: 'ssr_engine_cached' },
      },
      {
        source: '/docs/**',
        destination: '/docs/index',
      },
    ])

    expect(config.redirects).toEqual([
      {
        source: '/old',
        destination: '/new',
        type: 301,
      },
    ])

    expect(config.headers).toEqual([
      {
        source: '/static',
        headers: [{ key: 'cache-control', value: 'public, max-age=0' }],
      },
    ])

    expect(args.reporter.ref.warn).toHaveBeenCalledWith(
      expect.stringContaining('contains query parameters or hash fragments'),
    )
  })

  it('derives rewrite region from config overrides with fallback to defaults', () => {
    const { config } = buildHosting(
      createTestArgs<BuildHostingArgs>({
        routesManifest: [
          { type: 'function', path: '/ssr', functionId: 'ssr-engine' },
          { type: 'function', path: '/api', functionId: 'hello-world' },
        ],
        functionsMap: new Map([
          [
            'ssr-engine',
            {
              default: { deployId: 'ssr_engine', config: { region: 'asia-northeast1' } },
              cached: { deployId: 'ssr_engine_cached', config: { region: 'europe-west1' } },
            },
          ],
          [
            'hello-world',
            { default: { deployId: 'hello_world', config: { region: 'europe-west1' } } },
          ],
        ]),
        pathPrefix: '',
      }),
    )

    expect(config.rewrites).toEqual([
      {
        regex: '^/ssr(?:/)?$',
        function: { functionId: 'ssr_engine', region: 'asia-northeast1' },
      },
      {
        regex: '^/api(?:/)?$',
        function: { functionId: 'hello_world', region: 'europe-west1' },
      },
    ])
  })

  it('warns when cached route has no cached variant', () => {
    const args = createTestArgs<BuildHostingArgs>({
      routesManifest: [{ type: 'function', path: '/dsg', functionId: 'ssr-engine', cache: true }],
      functionsMap: new Map([['ssr-engine', { default: { deployId: 'ssr_engine', config: {} } }]]),
      pathPrefix: '',
    })
    const { config } = buildHosting(args)

    expect(config.rewrites).toEqual([
      {
        regex: '^/dsg(?:/)?$',
        function: { functionId: 'ssr_engine' },
      },
    ])

    expect(args.reporter.ref.warn).toHaveBeenCalledWith(
      expect.stringContaining('cache=true but cached variant could not be generated'),
    )
  })
})
