import path from 'node:path'
import fs from 'node:fs/promises'
import type { HttpsOptions } from 'firebase-functions/v2/https'
import type { FunctionsManifest, Reporter } from 'gatsby'
import type { FunctionExport, FunctionsArtifacts } from './types.js'
import {
  copyFileWithDirs,
  ensureEmptyDir,
  pLimit,
  relativeToPosix,
  isPathWithin,
  toPosix,
} from './utils.js'

export type FunctionsBuilderOptions = {
  functions: FunctionsManifest
  outDir: string
  projectRoot: string
  reporter: Reporter
  runtime: string
  functionsConfig?: HttpsOptions
  functionsConfigOverride?: Record<string, HttpsOptions>
}

export type FunctionsBuilderResult = {
  artifacts: FunctionsArtifacts | null
  idMap: Map<string, string>
}

const generateFunctionName = (id: string, used: Set<string>) => {
  const base = id
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  const prefixed = /^[a-z_$]/.test(base) ? base : `gatsby_fn_${base}`

  let candidate = prefixed
  let counter = 1
  while (used.has(candidate)) {
    candidate = `${prefixed}_${counter++}`
  }

  // Enforce max length (Cloud Function limit)
  if (candidate.length > 63) candidate = candidate.slice(0, 63)

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

const serializeConfig = (value: HttpsOptions | undefined) => JSON.stringify(value, null, 2)

const serializeConfigOverride = (
  exportsInfo: FunctionExport[],
  overrides: Record<string, HttpsOptions>,
) => {
  const relevant = exportsInfo.reduce<Record<string, HttpsOptions>>((accu, fn) => {
    const override = overrides[fn.originalId]
    if (override) accu[fn.originalId] = override
    return accu
  }, {})
  return JSON.stringify(relevant, null, 2)
}

export const prepareFunctionsWorkspace = async (
  options: FunctionsBuilderOptions,
): Promise<FunctionsBuilderResult> => {
  const {
    functions,
    outDir,
    projectRoot,
    reporter,
    runtime,
    functionsConfig,
    functionsConfigOverride = {},
  } = options

  if (!isPathWithin(projectRoot, outDir)) {
    throw new Error('[gatsby-adapter-firebase] functionsOutDir must be within the project root')
  }

  const idMap = new Map<string, string>()

  if (!functions.length) {
    try {
      await fs.rm(outDir, { recursive: true, force: true })
    } catch (error) {
      reporter.warn(
        `[gatsby-adapter-firebase] Failed to clean empty functions directory ${outDir}: ${String(error)}`,
      )
    }
    return { artifacts: null, idMap }
  }

  await ensureEmptyDir(outDir)

  const usedNames = new Set<string>()
  const exportsInfo: FunctionExport[] = []
  const copiedFiles = new Set<string>()

  for (const fn of functions) {
    if (idMap.has(fn.functionId)) {
      reporter.warn(
        `[gatsby-adapter-firebase] Duplicate functionId "${fn.functionId}" detected; keeping the first definition only.`,
      )
      continue
    }
    const deployedId = generateFunctionName(fn.functionId, usedNames)
    idMap.set(fn.functionId, deployedId)

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
            await copyFileWithDirs(absolute, destination)
            copiedFiles.add(toPosix(relativeFromRoot))
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
        `[gatsby-adapter-firebase] ${skip ? 'Skipping function' : 'Function'} \`${fn.functionId}\`: some required files could not be copied:${[
          '',
        ]
          .concat(missingFiles.map(({ file, error }) => `${toPosix(file)}: ${error}`))
          .join('\n · ')}`,
      )
      if (skip) {
        idMap.delete(fn.functionId)
        continue
      }
    }

    exportsInfo.push({
      originalId: fn.functionId,
      deployedId,
      relativeEntry: resolveEntryRelativePath(outDir, entryDestination),
    })
  }

  if (!exportsInfo.length) {
    try {
      await fs.rm(outDir, { recursive: true, force: true })
    } catch (error) {
      reporter.warn(
        `[gatsby-adapter-firebase] Failed to clean functions directory ${toPosix(outDir)} after skipping functions: ${(error as Error).message}`,
      )
    }
    idMap.clear()
    return { artifacts: null, idMap }
  }

  const indexLines = [
    '// Auto-generated by gatsby-adapter-firebase. Do not edit.',
    "'use strict'",
    '',
    "const { onRequest } = require('firebase-functions/v2/https')",
    '',
    `const DEFAULT_OPTIONS = ${serializeConfig(functionsConfig)}`,
    `const OVERRIDE_OPTIONS = ${serializeConfigOverride(exportsInfo, functionsConfigOverride)}`,
    '',
    'const isPlainObject = (value) => Object.prototype.toString.call(value) === "[object Object]"',
    '',
    'const mergeOptions = (...sources) => {',
    '  const filtered = sources.filter((candidate) => isPlainObject(candidate))',
    '  if (filtered.length === 0) return undefined',
    '  return Object.assign({}, ...filtered)',
    '}',
    '',
    'const createHttpsFunction = (handlerExports, functionId) => {',
    '  const handler = handlerExports?.default || handlerExports',
    '  const options = mergeOptions(',
    '    DEFAULT_OPTIONS,',
    '    OVERRIDE_OPTIONS[functionId],',
    '    handlerExports?.options,',
    '  )',
    '  if (options) {',
    '    return onRequest(options, handler)',
    '  }',
    '  return onRequest(handler)',
    '}',
    '',
    ...exportsInfo.map(
      (fn) =>
        `exports.${fn.deployedId} = createHttpsFunction(require('${fn.relativeEntry}'), '${fn.originalId}')`,
    ),
    '',
  ]
  const indexFile = path.join(outDir, 'index.js')
  await fs.writeFile(indexFile, indexLines.join('\n'), 'utf8').catch((error) => {
    throw new Error(`[gatsby-adapter-firebase] Failed to write ${indexFile}: ${String(error)}`)
  })

  const enginesEntry = runtimeToEngineConstraint(runtime)
  const packageJson = {
    type: 'commonjs',
    ...(enginesEntry ? { engines: { node: enginesEntry } } : {}),
    dependencies: {
      'firebase-functions': '^6.0.0',
    },
  }

  const pkgFile = path.join(outDir, 'package.json')
  await fs.writeFile(pkgFile, JSON.stringify(packageJson, null, 2), 'utf8').catch((error) => {
    throw new Error(`[gatsby-adapter-firebase] Failed to write ${pkgFile}: ${String(error)}`)
  })

  return { artifacts: { exports: exportsInfo, copiedFiles }, idMap }
}
