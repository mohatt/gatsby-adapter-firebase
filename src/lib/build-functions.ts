import path from 'node:path'
import fs from 'node:fs/promises'
import type { FunctionsManifest, RoutesManifest } from 'gatsby'
import {
  FunctionEntry,
  FunctionVariants,
  FunctionsWorkspace,
  FunctionsRuntimeExport,
  FirebaseFunctionsJson,
} from './types.js'
import type { FunctionConfig } from './runtime/types.js'
import { pLimit, relativeToPosix, isPathWithin, toPosix, resolveDistPath } from './utils.js'
import { AdaptorReporter, AdaptorError } from './reporter.js'

export interface BuildFunctionsOptions {
  functionsOutDir: string
  functionsCodebase: string
  functionsRuntime: string
  functionsConfig?: FunctionConfig
  functionsConfigOverride?: Record<string, FunctionConfig>
}

export type BuildFunctionsArgs = {
  functionsManifest: Readonly<FunctionsManifest>
  routesManifest: Readonly<RoutesManifest>
  projectRoot: string
  reporter: AdaptorReporter
  options: BuildFunctionsOptions
}

export type BuildFunctionsResult = {
  functionsMap: ReadonlyMap<string, FunctionVariants>
  workspace?: FunctionsWorkspace | null
  config?: FirebaseFunctionsJson | null
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

const resolveEntryRelativePath = (outDir: string, entry: string) => {
  const rel = relativeToPosix(outDir, entry)
  if (rel.startsWith('../') || rel.startsWith('./')) {
    return rel
  }
  return `./${rel}`
}

const normalizeRelativePath = (value: string, projectRoot: string) => {
  const absolute = path.isAbsolute(value) ? value : path.join(projectRoot, value)
  return path.resolve(absolute)
}

const runtimeToEngineConstraint = (runtime: string) => {
  const match = /^nodejs(\d+)/.exec(runtime)
  if (!match) return undefined
  const major = Number(match[1])
  if (!Number.isInteger(major)) return undefined
  return `>=${major}`
}

const resolveFunctionConfig = <T extends FunctionConfig>(base?: T, override?: T): T | undefined => {
  const result = { ...base, ...override }
  return Object.keys(result).length ? result : undefined
}

export const buildFunctions = async (args: BuildFunctionsArgs): Promise<BuildFunctionsResult> => {
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

  const functionsMap = new Map<string, FunctionVariants>()

  if (!functionsManifest.length) {
    try {
      await fs.rm(outDir, { recursive: true, force: true })
    } catch (error) {
      reporter.warn(`Failed to clean empty functions directory ${outDir}: ${String(error)}`)
    }
    return { workspace: null, config: null, functionsMap }
  }

  try {
    await fs.rm(outDir, { recursive: true, force: true })
    await fs.mkdir(outDir, { recursive: true })
  } catch (error) {
    throw new AdaptorError(`Failed to re-create functions directory ${outDir}`, error)
  }

  const workspace: FunctionsWorkspace = { dir: outDir, files: [], exports: [] }
  const cachedIds: ReadonlySet<string> = routesManifest.reduce((accu, route) => {
    if (route.type === 'function' && route.cache) {
      accu.add(route.functionId)
    }
    return accu
  }, new Set<string>())
  const usedNames = new Set<string>()

  const addWorkspaceFile = (absolute: string) => {
    const relative = toPosix(path.relative(outDir, absolute))
    if (!workspace.files.includes(relative)) workspace.files.push(relative)
  }

  for (const fn of functionsManifest) {
    if (functionsMap.has(fn.functionId)) {
      reporter.warn(
        `Duplicate functionId "${fn.functionId}" detected; keeping the first definition only`,
      )
      continue
    }

    const entryAbsolute = normalizeRelativePath(fn.pathToEntryPoint, projectRoot)
    const entryRelativeFromRoot = path.relative(projectRoot, entryAbsolute)
    const entryDestination = path.resolve(outDir, entryRelativeFromRoot)

    const limit = await pLimit(16)
    const copyResults = await Promise.all(
      fn.requiredFiles.map((file) =>
        limit(async () => {
          const absolute = normalizeRelativePath(file, projectRoot)
          const relativeFromRoot = path.relative(projectRoot, absolute)
          const destination = path.resolve(outDir, relativeFromRoot)
          const isEntry = absolute === entryAbsolute

          if (!isPathWithin(outDir, destination)) {
            return { file, isEntry, error: 'file outside workspace root' }
          }

          try {
            await fs.mkdir(path.dirname(destination), { recursive: true })
            await fs.copyFile(absolute, destination)
            addWorkspaceFile(destination)
            return { file, isEntry, error: null }
          } catch (error) {
            return { file, isEntry, error: error.message }
          }
        }),
      ),
    )

    const missingFiles = copyResults.filter(({ error }) => error != null)
    if (missingFiles.length > 0) {
      // Skip the function if entry file is missing, or +2 required files are missing
      const skip = missingFiles.some(({ isEntry }, i) => isEntry || i > 1)
      reporter.warn(
        `${skip ? 'Skipping function' : 'Function'} \`${fn.functionId}\`: some required files could not be copied:${[
          '',
        ]
          .concat(missingFiles.map(({ file, error }) => `${toPosix(file)}: ${error}`))
          .join('\n - ')}`,
      )
      if (skip) {
        continue
      }
    }

    const id = fn.functionId
    const defaultVariant: FunctionEntry = {
      id,
      variant: 'default',
      deployId: generateFunctionName(id, usedNames),
      entryFile: resolveEntryRelativePath(outDir, entryDestination),
      config: resolveFunctionConfig(functionsConfig, functionsConfigOverride[id]),
    }

    // Create a cached variant if the function is cached
    let cachedVariant: FunctionEntry | undefined
    if (cachedIds.has(id)) {
      const cachedId = `${id}-cached`
      cachedVariant = {
        id: cachedId,
        variant: 'cached',
        deployId: generateFunctionName(cachedId, usedNames),
        entryFile: defaultVariant.entryFile,
        config: resolveFunctionConfig(functionsConfig, functionsConfigOverride[cachedId]),
      }
    }

    functionsMap.set(id, { default: defaultVariant, cached: cachedVariant })
    workspace.exports.push(defaultVariant)
    if (cachedVariant) workspace.exports.push(cachedVariant)
  }

  if (!functionsMap.size) {
    try {
      await fs.rm(outDir, { recursive: true, force: true })
    } catch (error) {
      reporter.warn(
        `Failed to clean functions directory ${outDir} after skipping functions: ${String(error)}`,
      )
    }
    functionsMap.clear()
    return { workspace: null, config: null, functionsMap }
  }

  const runtimeModulePath = resolveDistPath('lib/runtime.cjs')
  const runtimeTarget = './.adapter/runtime.cjs'
  const runtimeTargetPath = path.join(outDir, runtimeTarget)
  const adaptorDir = path.dirname(runtimeTargetPath)
  await fs.mkdir(adaptorDir, { recursive: true }).catch((error) => {
    throw new AdaptorError(`Failed to create adaptor directory ${adaptorDir}`, error)
  })
  await fs.copyFile(runtimeModulePath, runtimeTargetPath).catch((error) => {
    throw new AdaptorError(`Failed to copy runtime module to ${runtimeTargetPath}`, error)
  })
  addWorkspaceFile(runtimeTargetPath)

  const exportLines: string[] = []
  const runtimeImports: FunctionsRuntimeExport[] = []
  const addFunctionExport = (factory: FunctionsRuntimeExport, fn: FunctionEntry) => {
    if (!runtimeImports.includes(factory)) runtimeImports.push(factory)
    exportLines.push(
      `exports.${fn.deployId} = ${factory}(require('${fn.entryFile}'), '${fn.id}'${fn.config ? `, ${JSON.stringify(fn.config, null, 2)}` : ''})`,
    )
  }

  functionsMap.forEach((variants) => {
    addFunctionExport('createHttpsFunction', variants.default)
    if (variants.cached) addFunctionExport('createCachedHttpsFunction', variants.cached)
  })

  const indexLines: string[] = [
    '// Auto-generated by gatsby-adapter-firebase. Do not edit.',
    `'use strict'`,
    '',
    runtimeImports.length
      ? `const { ${runtimeImports.join(', ')} } = require('${runtimeTarget}')`
      : '',
    '',
    ...exportLines,
    '',
  ]
  const indexFile = path.join(outDir, 'index.js')
  await fs.writeFile(indexFile, indexLines.join('\n'), 'utf8').catch((error) => {
    throw new AdaptorError(`Failed to write ${indexFile}`, error)
  })
  addWorkspaceFile(indexFile)

  const nodeEngine = runtimeToEngineConstraint(functionsRuntime)
  const packageJson = {
    type: 'commonjs',
    ...(nodeEngine ? { engines: { node: nodeEngine } } : {}),
    dependencies: {
      'firebase-functions': '^6.0.0',
      'firebase-admin': '^12.0.0',
    },
  }

  const pkgFile = path.join(outDir, 'package.json')
  await fs.writeFile(pkgFile, JSON.stringify(packageJson, null, 2), 'utf8').catch((error) => {
    throw new AdaptorError(`Failed to write ${pkgFile}`, error)
  })
  addWorkspaceFile(pkgFile)

  return {
    workspace,
    functionsMap,
    config: {
      codebase: functionsCodebase,
      source: relativeToPosix(projectRoot, outDir) || '.',
      runtime: functionsRuntime,
    },
  }
}
