import { createTestArgs } from '../test/util.js'
import { buildHosting, BuildHostingArgs } from '../src/lib/build-hosting.js'

describe('buildHosting()', () => {
  it('converts Gatsby routes into Firebase hosting rules', () => {
    const args = createTestArgs<BuildHostingArgs>({
      routesManifest: [
        { type: 'function', path: '/ssr', functionId: 'ssr-engine' },
        { type: 'function', path: '/ssr/page-data.json', functionId: 'ssr-engine' },
        { type: 'function', path: '/ssr-deferred', functionId: 'ssr-engine', cache: true },
        { type: 'redirect', path: '/docs/*', toPath: '/docs/index', status: 200, headers: [] },
        { type: 'redirect', path: '/en/docs/*', toPath: '/docs/*', status: 301, headers: [] },
        {
          type: 'redirect',
          path: '/old',
          toPath: '/new',
          status: 302,
          headers: [{ key: 'test', value: 'ignored' }],
        },
        {
          type: 'redirect',
          path: '/ext',
          toPath: 'https://www.awesomesite.com',
          status: 200,
          headers: [],
        },
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
    expect(config).toMatchSnapshot('config')
    expect(args.gatsbyReporter.warn.mock.calls).toMatchSnapshot('warnings')
  })

  it('converts redirect splats and params into Firebase-compatible patterns', () => {
    const args = createTestArgs<BuildHostingArgs>({
      routesManifest: [
        { type: 'redirect', path: '/old/*', toPath: '/new', status: 301, headers: [] },
        { type: 'redirect', path: '/old/*', toPath: '/new/*', status: 302, headers: [] },
        { type: 'redirect', path: '/old/path', toPath: '/new/path', status: 301, headers: [] },
        {
          type: 'redirect',
          path: '/old/:id/profile',
          toPath: '/new/:id/profile',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/old/:id/posts/*',
          toPath: '/new/:id/posts/*',
          status: 302,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/old/*/post/*',
          toPath: '/new/*/article/*',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/old/*',
          toPath: '/new/*/page?foo=bar#head',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/old/*',
          toPath: '/new/*/?foo=bar#head',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/awesome/*',
          toPath: 'https://www.awesomesite.com/docs/*',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/awesome/*',
          toPath: 'https://www.awesomesite.com/docs/*/page?foo=bar#head',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/awesome/*/post/*',
          toPath: 'https://www.awesomesite.com/docs/*/article/*/?from=bar#head',
          status: 301,
          headers: [],
        },
      ],
      pathPrefix: '',
    })
    const { config } = buildHosting(args)
    expect(config).toMatchSnapshot('config')
    expect(args.gatsbyReporter.warn).not.toBeCalled()
  })

  it('derives rewrite region from config overrides with fallback to defaults', () => {
    const args = createTestArgs<BuildHostingArgs>({
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
    })
    const { config } = buildHosting(args)
    expect(config).toMatchSnapshot('config')
    expect(args.gatsbyReporter.warn).not.toBeCalled()
  })

  it('warns when cached route has no cached variant', () => {
    const args = createTestArgs<BuildHostingArgs>({
      routesManifest: [{ type: 'function', path: '/dsg', functionId: 'ssr-engine', cache: true }],
      functionsMap: new Map([['ssr-engine', { default: { deployId: 'ssr_engine', config: {} } }]]),
      pathPrefix: '',
    })
    const { config } = buildHosting(args)
    expect(config).toMatchSnapshot('config')
    expect(args.gatsbyReporter.warn.mock.calls).toMatchSnapshot('warnings')
  })

  it('applies pathPrefix only to internal destinations', () => {
    const args = createTestArgs<BuildHostingArgs>({
      pathPrefix: '/stage',
      routesManifest: [
        { type: 'redirect', path: '/docs/*', toPath: '/help/*', status: 301, headers: [] },
        { type: 'redirect', path: '/docs/static', toPath: '/landing', status: 302, headers: [] },
        {
          type: 'redirect',
          path: '/docs/*',
          toPath: 'https://external.example.com/docs/*',
          status: 301,
          headers: [],
        },
        {
          type: 'redirect',
          path: '/docs/*',
          toPath: 'https://external.example.com/docs/*/page?foo=bar#head',
          status: 301,
          headers: [],
        },
      ],
    })
    const { config } = buildHosting(args)
    expect(config).toMatchSnapshot('config')
    expect(args.gatsbyReporter.warn).not.toBeCalled()
  })
})
