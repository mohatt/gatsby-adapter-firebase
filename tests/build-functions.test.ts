import { createTestArgs, mountTestProject } from '../test/util.js'
import { buildFunctions, BuildFunctionsArgs } from '../src/lib/build-functions.js'

describe('buildFunctions()', () => {
  it('builds test-project correctly', async () => {
    const { vol, adaptArgs } = await mountTestProject('test-project')
    const args = createTestArgs<BuildFunctionsArgs>(adaptArgs)
    const result = await buildFunctions(args)
    await expect(vol).toMatchVolumeSnapshot('test-project', {
      prefix: args.projectRoot,
      report: 'all',
    })
    expect(result.config).toMatchSnapshot('firebase.json')
  })

  it('builds test-project with custom options', async () => {
    const { vol, adaptArgs } = await mountTestProject('test-project')
    const args = createTestArgs<BuildFunctionsArgs>({
      ...adaptArgs,
      options: {
        functionsOutDir: '.firebase/test',
        functionsCodebase: 'test-functions',
        functionsRuntime: 'node22',
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
      },
    })
    const result = await buildFunctions(args)
    await expect(vol).toMatchVolumeSnapshot('test-project-custom', {
      prefix: args.projectRoot,
      report: 'all',
    })
    expect(result.config).toMatchSnapshot('firebase.json')
  })
})
