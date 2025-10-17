import { createGatsbyReporter, mountTestProject, projectRoot } from '../test/util.js'
import createAdapter from '../src/index.js'

describe('adapter()', () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('builds test-project with default options', async () => {
    const { vol, adaptArgs } = await mountTestProject('test-project')
    const adapter = createAdapter()
    expect(adapter).toHaveProperty('name', 'gatsby-adapter-firebase')

    const reporter = createGatsbyReporter()
    await expect(adapter.config({ reporter } as any)).resolves.toMatchSnapshot('config')

    await expect(adapter.adapt({ ...adaptArgs, reporter } as any)).resolves.toBe(undefined)

    await expect(vol).toMatchVolumeSnapshot('test-project', {
      prefix: projectRoot,
      report: 'all',
    })

    // assert reporter calls
    expect(reporter.verbose.mock.calls).toMatchSnapshot('reporter.verbose')
    expect(reporter.activityTimer.mock.calls).toMatchSnapshot('reporter.activityTimer')
    expect(reporter.activity.setStatus.mock.calls).toMatchSnapshot(
      'reporter.activityTimer.setStatus',
    )
  })

  it('builds test-project with custom options', async () => {
    const { vol, adaptArgs } = await mountTestProject('test-project')
    const adapter = createAdapter({
      hostingTarget: 'custom-hosting',
      functionsOutDir: 'functions/custom',
      functionsCodebase: 'custom-functions',
      functionsRuntime: 'nodejs22',
      functionsConfig: {
        labels: {
          custom: 'custom-label',
        },
      },
      functionsConfigOverride: {
        'ssr-engine': {
          timeoutSeconds: 120,
          region: 'asia-northeast1',
        },
      },
      storageBucket: 'test-project.appspot.com',
      excludeDatastoreFromEngineFunction: true,
    })

    vi.stubEnv('DEPLOY_URL', 'https://test.local')
    const reporter = createGatsbyReporter()
    await expect(adapter.config({ reporter } as any)).resolves.toMatchSnapshot('config')

    await expect(adapter.adapt({ ...adaptArgs, reporter } as any)).resolves.toBe(undefined)

    await expect(vol).toMatchVolumeSnapshot('test-project-custom', {
      prefix: projectRoot,
      report: 'all',
    })
  })
})
