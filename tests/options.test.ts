import { describe, expect, it } from 'vitest'
import { AdapterOptions, validateOptions } from '../src/options.js'

interface TestCase {
  title: string
  options: AdapterOptions | Record<string, unknown>
}

const testCases: TestCase[] = [
  {
    title: 'accepts defaults with no options',
    options: {},
  },
  {
    title: 'accepts valid options',
    options: {
      hostingTarget: 'custom',
      functionsOutDir: 'custom/functions',
      functionsCodebase: 'custom',
      functionsRuntime: 'nodejs22',
      functionsConfig: {
        region: 'us-west1',
        timeoutSeconds: 120,
        unsupportedCustomFlag: { unknown: 'value' },
      },
      functionsConfigOverride: {
        'ssr-engine': {
          region: 'asia-northeast1',
          concurrency: 10,
        },
      },
      storageBucket: 'test-project.appspot.com',
      excludeDatastoreFromEngineFunction: true,
    },
  },
  {
    title: 'warns unknown options',
    options: {
      unknown: 'value',
    },
  },
  {
    title: 'rejects invalid options',
    options: {
      hostingTarget: 123,
      functionsOutDir: false,
      functionsCodebase: ['invalid'],
      functionsRuntime: 'nodejs18',
      functionsConfig: 'invalid',
      functionsConfigOverride: {
        'ssr-engine': 'invalid',
      },
      storageBucket: [123],
      excludeDatastoreFromEngineFunction: 'notBoolean',
    },
  },
  {
    title: 'rejects empty options',
    options: {
      hostingTarget: '',
      functionsOutDir: '',
      functionsCodebase: '',
      functionsRuntime: '',
      storageBucket: '',
    },
  },
  {
    title: 'rejects invalid options object',
    options: null,
  },
]

describe('options', () => {
  it.each(testCases)('$title', async ({ options }) => {
    await expect(validateOptions(options)).resolves.toMatchSnapshot('result')
  })
})
