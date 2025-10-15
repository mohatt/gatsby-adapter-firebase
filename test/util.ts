import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { vol, DirectoryJSON } from 'memfs'
import { readDirToMap } from 'vitest-memfs/util'
import type { IAdapter } from 'gatsby'
import type { AdapterOptions } from '../src/options.js'
import { AdaptorReporter, IErrorMeta } from '../src/lib/reporter.js'

// Virtual Project Root
export const projectRoot = '/virtual/project'

// Mounts a virtual project volume from a real directory under `__fixtures__/`
export async function mountTestProject(name: string) {
  const projectDir = path.join(path.dirname(expect.getState().testPath), '__fixtures__', name)
  const entries = await readDirToMap(projectDir, { prefix: projectRoot })

  const jsonVol: DirectoryJSON = {}
  for (const entryPath in entries) {
    const entry = entries[entryPath]
    if (entry.kind === 'file') {
      jsonVol[entryPath] = await entry.file.read()
    } else if (entry.kind === 'empty-dir') {
      jsonVol[entryPath] = null
    }
  }

  // Re-populate the volume
  vol.reset()
  vol.fromJSON(jsonVol)

  // Write a mock runtime.cjs and package.json
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const runtimeFile = path.resolve(__dirname, '../src/lib/lib/runtime.cjs')
  const pkgFile = path.resolve(__dirname, '../src/package.json')
  vol.mkdirSync(path.dirname(runtimeFile), { recursive: true })
  vol.writeFileSync(runtimeFile, '// runtime\nmodule.exports = {}')
  vol.writeFileSync(pkgFile, '{ "version": "0.0.0-test" }')

  let adaptArgs: AdaptArgs | undefined
  const fs = await importActualFS()
  try {
    const data = await fs.promises.readFile(
      path.join(path.dirname(projectDir), `${name}.json`),
      'utf8',
    )
    adaptArgs = JSON.parse(data)
  } catch {
    /**/
  }

  return { vol, adaptArgs }
}

export async function importActualFS() {
  return vi.importActual<typeof import('fs')>('fs')
}

export function createGatsbyReporter() {
  // Tracks internal reporter state
  const state = {
    errMap: {} as Record<IErrorMeta['id'], { text(context: IErrorMeta['context']): string }>,
  }
  const activity = {
    start: vi.fn(),
    setStatus: vi.fn(),
    panic: vi.fn(),
    end: vi.fn(),
  }
  return {
    verbose: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    panic: vi.fn().mockImplementation(({ id, error, context }: IErrorMeta) => {
      throw { text: state.errMap[id].text(context), error }
    }),
    setErrorMap: vi.fn().mockImplementation((map) => Object.assign(state.errMap, map)),
    activityTimer: vi.fn().mockImplementation(() => activity),
  }
}

type AdaptArgs = Omit<Parameters<IAdapter['adapt']>[0], 'reporter'>

interface TestArgs {
  options?: AdapterOptions
  reporter?: AdaptorReporter
  projectRoot?: string
}

export function createTestArgs<T extends TestArgs>(
  args?: Omit<T, keyof TestArgs> & Partial<Pick<T, 'options'>>,
) {
  const gatsbyReporter = createGatsbyReporter()
  const reporter = new AdaptorReporter(gatsbyReporter as any)
  const options: T['options'] = {
    functionsOutDir: '.firebase/test',
    functionsCodebase: 'test-hosting',
    functionsRuntime: 'node20',
    functionsConfig: {},
    functionsConfigOverride: {
      'ssr-engine': {
        timeoutSeconds: 120,
        region: 'asia-northeast1',
      },
    },
    excludeDatastoreFromEngineFunction: false,
    hostingTarget: 'test-functions',
    ...args?.options,
  }
  return {
    ...(args as T),
    projectRoot,
    gatsbyReporter,
    reporter,
    options,
  } as const
}
