import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import stableStringify from 'safe-stable-stringify'
import type { FunctionsManifest, RoutesManifest } from 'gatsby'
import {
  FunctionDeployment,
  FunctionDeploymentSet,
  FirebaseFunctionsJson,
  FunctionDeploymentKind,
  FunctionsRuntimeExport,
} from './types.js'
import type { FunctionConfig } from './runtime/types.js'
import { AdaptorReporter, AdaptorError } from './reporter.js'
import {
  pLimit,
  hashFile,
  toPosix,
  isPathWithin,
  relativeToPosix,
  resolveDistPath,
  readGatsbyPackageJson,
} from './utils.js'

export interface BuildFunctionsOptions {
  functionsOutDir: string
  functionsCodebase: string
  functionsRuntime: string
  functionsConfig?: FunctionConfig
  functionsConfigOverride?: Record<string, FunctionConfig>
}

export interface BuildFunctionsArgs {
  functionsManifest: Readonly<FunctionsManifest>
  routesManifest: Readonly<RoutesManifest>
  projectRoot: string
  reporter: AdaptorReporter
  options: BuildFunctionsOptions
}

export interface FunctionsWorkspace {
  dir: string
  files: Map<string, string>
  deployments: FunctionDeployment[]
}

export interface BuildFunctionsResult {
  functionsMap: ReadonlyMap<string, FunctionDeploymentSet>
  workspace: FunctionsWorkspace
  config: FirebaseFunctionsJson
}

const MAX_FUNCTION_NAME_LENGTH = 63

const hashSuffix = (value: string) => {
  const hash = Math.abs(
    [...value].reduce((acc, char) => {
      acc = (acc << 5) - acc + char.charCodeAt(0)
      return acc | 0
    }, 0),
  )
    .toString(36)
    .slice(0, 6)
  return `_${hash}`
}

const applyLengthConstraint = (value: string) => {
  if (value.length <= MAX_FUNCTION_NAME_LENGTH) return value
  const suffix = hashSuffix(value)
  const prefix = value.slice(0, MAX_FUNCTION_NAME_LENGTH - suffix.length)
  return `${prefix}${suffix}`
}

const generateFunctionName = (id: string, used: Set<string>) => {
  const base = id
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  const normalized = /^[a-z_$]/.test(base) ? base : `gatsby_fn_${base}`
  let counter = 0
  let candidate: string

  do {
    const suffix = counter === 0 ? '' : `_${counter}`
    candidate = applyLengthConstraint(`${normalized}${suffix}`)
    counter += 1
  } while (used.has(candidate))

  used.add(candidate)
  return candidate
}

const ensureRelativeRequire = (value: string) => {
  if (value.startsWith('../') || value.startsWith('./')) return value
  return `./${value}`
}

const runtimeToEngineConstraint = (runtime: string) => {
  const match = /^nodejs(\d+)/.exec(runtime)
  if (!match) return undefined
  const major = Number(match[1])
  if (!Number.isInteger(major)) return undefined
  return `>=${major}`
}

export const buildFunctions = async (
  args: BuildFunctionsArgs,
): Promise<BuildFunctionsResult | null> => {
  const {
    projectRoot,
    routesManifest,
    functionsManifest,
    reporter,
    options: {
      functionsCodebase,
      functionsRuntime,
      functionsOutDir,
      functionsConfig,
      functionsConfigOverride = {},
    },
  } = args

  const outDir = path.resolve(projectRoot, functionsOutDir)
  if (!isPathWithin(projectRoot, outDir)) {
    throw new AdaptorError('functionsOutDir must be within the project root')
  }

  await fs.rm(outDir, { recursive: true, force: true })
  if (!functionsManifest.length) {
    return null
  }

  const adaptorDir = path.join(outDir, '.adapter')
  const functionModulesDir = path.join(adaptorDir, 'functions')
  const runtimeModulePath = path.join(adaptorDir, 'runtime.cjs')
  try {
    await fs.mkdir(functionModulesDir, { recursive: true })
  } catch (error) {
    throw new AdaptorError(`Failed to create functions directory ${functionModulesDir}`, error)
  }

  const functionsMap = new Map<string, FunctionDeploymentSet>()
  const workspace: FunctionsWorkspace = { dir: outDir, files: new Map(), deployments: [] }
  const cachedIds: ReadonlySet<string> = routesManifest.reduce((accu, route) => {
    if (route.type === 'function' && route.cache) {
      accu.add(route.functionId)
    }
    return accu
  }, new Set<string>())
  const usedNames = new Set<string>()
  const globalVersionFiles = new Set<string>()

  const addWorkspaceFile = async (absolute: string, includeInVersion?: boolean) => {
    if (!workspace.files.has(absolute)) {
      workspace.files.set(absolute, await hashFile(absolute))
    }
    if (includeInVersion) {
      globalVersionFiles.add(absolute)
    }
  }

  const writeDeploymentModuleFile = async (deployment: FunctionDeployment) => {
    const { kind, config, meta, modulePath, entryPath } = deployment
    const moduleDir = path.dirname(modulePath)
    const runtimeRequirePath = ensureRelativeRequire(relativeToPosix(moduleDir, runtimeModulePath))
    const entryRequirePath = ensureRelativeRequire(relativeToPosix(moduleDir, entryPath))
    const factory: FunctionsRuntimeExport =
      kind === 'cached' ? 'createCachedHttpsFunction' : 'createHttpsFunction'
    const lines = [
      '// Auto-generated by gatsby-adapter-firebase. Do not edit.',
      `'use strict'`,
      '',
      `const { ${factory} } = require('${runtimeRequirePath}')`,
      '',
      `const METADATA = ${stableStringify(meta, null, 2)}`,
      `const CONFIG = ${stableStringify(config, null, 2)}`,
      '',
      `module.exports = ${factory}(require('${entryRequirePath}'), METADATA, CONFIG)`,
      '',
    ]
    await fs.writeFile(modulePath, lines.join('\n'), 'utf8')
  }

  const createDeployment = async (
    id: string,
    name: string,
    entryPath: string,
    files: string[],
    kind: FunctionDeploymentKind,
  ) => {
    const deployId = generateFunctionName(id, usedNames)
    const modulePath = path.join(functionModulesDir, `${deployId}.js`)

    const deployment: FunctionDeployment = {
      id,
      kind,
      deployId,
      modulePath,
      entryPath,
      meta: {
        id,
        name: name === 'SSR & DSG' ? (kind == 'cached' ? 'DSG' : 'SSR') : name,
        generator: 'gatsby-adapter-firebase',
        // placeholder till we generate function version hash
        version: 'build',
      },
      files: files.concat(modulePath),
      config: { ...functionsConfig, ...functionsConfigOverride[id] },
    }

    await writeDeploymentModuleFile(deployment)
    await addWorkspaceFile(modulePath)
    workspace.deployments.push(deployment)

    return deployment
  }

  for (const func of functionsManifest) {
    const { functionId: id, name } = func
    if (functionsMap.has(id)) {
      reporter.warn(`Duplicate functionId \`${id}\`; keeping the first definition only`)
      continue
    }

    const limit = await pLimit(16)
    const copyResults = await Promise.all(
      func.requiredFiles.map((from) =>
        limit(async () => {
          const fromPath = path.resolve(projectRoot, from)
          const to = path.relative(projectRoot, fromPath)
          const toPath = path.resolve(outDir, to)

          // the file has already been copied and hashed in a previous function
          if (workspace.files.has(fromPath)) {
            return { to, toPath, error: null }
          }

          // this should not happen, but just in case
          if (!isPathWithin(outDir, toPath)) {
            return { to, toPath, error: 'file outside workspace root' }
          }

          try {
            await fs.mkdir(path.dirname(toPath), { recursive: true })
            await fs.copyFile(fromPath, toPath)
            await addWorkspaceFile(toPath)
            return { to, toPath, error: null }
          } catch (error) {
            return { to, toPath, error: error.message }
          }
        }),
      ),
    )

    const entryToPath = path.resolve(outDir, func.pathToEntryPoint)
    const missing = copyResults.filter(({ error }) => error != null)
    if (missing.length > 0) {
      // Skip the function if entry file is missing, or +2 required files are missing
      const skip = missing.some(({ toPath }, i) => toPath === entryToPath || i > 1)
      reporter.warn(
        `${skip ? 'Skipping function' : 'Function'} \`${id}\`: some required files could not be copied:`,
        missing.map(({ to, error }) => `${toPosix(to)}: ${error}`),
      )
      if (skip) {
        continue
      }
    }

    const files = copyResults.filter(({ error }) => error == null).map(({ toPath }) => toPath)
    try {
      const defaultDep = await createDeployment(id, name, entryToPath, files, 'default')
      // Create a cached deployment if the function is cached
      const cachedDep = cachedIds.has(id)
        ? await createDeployment(`${id}-cached`, name, entryToPath, files, 'cached')
        : undefined
      functionsMap.set(id, { default: defaultDep, cached: cachedDep })
    } catch (error) {
      throw new AdaptorError(`Failed building function \`${id}\``, error)
    }
  }

  if (!functionsMap.size) {
    await fs.rm(outDir, { recursive: true, force: true })
    return null
  }

  const runtimeDistPath = resolveDistPath('lib/runtime.cjs')
  try {
    await fs.copyFile(runtimeDistPath, runtimeModulePath)
    await addWorkspaceFile(runtimeModulePath, true)
  } catch (error) {
    throw new AdaptorError(`Failed to copy functions runtime module ${runtimeModulePath}`, error)
  }

  const indexLines: string[] = [
    '// Auto-generated by gatsby-adapter-firebase. Do not edit.',
    `'use strict'`,
    '',
  ]
  for (const { deployId, modulePath } of workspace.deployments) {
    const moduleRequirePath = ensureRelativeRequire(relativeToPosix(outDir, modulePath))
    indexLines.push(`exports.${deployId} = require('${moduleRequirePath}')`, '')
  }
  const indexFile = path.join(outDir, 'index.js')
  try {
    await fs.writeFile(indexFile, indexLines.join('\n'), 'utf8')
    await addWorkspaceFile(indexFile)
  } catch (error) {
    throw new AdaptorError(`Failed to write functions index file ${indexFile}`, error)
  }

  const nodeEngine = runtimeToEngineConstraint(functionsRuntime)
  const packageJson = {
    type: 'commonjs',
    ...(nodeEngine ? { engines: { node: nodeEngine } } : {}),
    dependencies: {
      'gatsby': `${readGatsbyPackageJson().version}`,
      'firebase-admin': '^13.0.0',
      'firebase-functions': '^6.0.0',
    },
  }

  const pkgFile = path.join(outDir, 'package.json')
  try {
    await fs.writeFile(pkgFile, stableStringify(packageJson, null, 2), 'utf8')
    await addWorkspaceFile(pkgFile, true)
  } catch (error) {
    throw new AdaptorError(`Failed to write functions package.json file ${pkgFile}`, error)
  }

  await Promise.all(
    workspace.deployments.map(async (entry) => {
      // ensure files are ordered deterministically
      const ordered = [...globalVersionFiles, ...entry.files]
        .map((absolute) => {
          const name = relativeToPosix(outDir, absolute)
          return { name, hash: workspace.files.get(absolute) }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      // Combine results deterministically
      const combined = crypto.createHash('sha256')
      for (const { name, hash } of ordered) {
        combined.update(name)
        combined.update('\0')
        combined.update(hash)
        combined.update('\0')
      }
      entry.meta.version = combined.digest('hex')
      await writeDeploymentModuleFile(entry)
    }),
  )

  return {
    workspace,
    functionsMap,
    config: {
      codebase: functionsCodebase,
      source: relativeToPosix(projectRoot, outDir) || '.',
      runtime: functionsRuntime,
      ignore: ['node_modules', '.git', 'firebase-debug.log', 'firebase-debug.*.log', '*.local'],
    },
  }
}
