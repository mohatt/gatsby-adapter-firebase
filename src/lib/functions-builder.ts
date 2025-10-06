import path from 'node:path'
import fs from 'node:fs/promises'
import type { FunctionsManifest, Reporter } from 'gatsby'
import type { FunctionExport, PreparedFunctions } from './types.js'
import { copyFileWithDirs, ensureEmptyDir, pLimit, relativeToPosix, isPathWithin, toPosix } from './utils.js'

export type FunctionsBuilderOptions = {
  functions: FunctionsManifest
  outDir: string
  projectRoot: string
  reporter: Reporter
  runtime: string
  region: string
}

export type FunctionsBuilderResult = {
  prepared: PreparedFunctions | null
  idMap: Map<string, string>
}

const sanitizeFunctionName = (value: string, used: Set<string>) => {
  const base = value
    .replace(/[^A-Za-z0-9_$]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+/, '')
  const prefixed = /^[A-Za-z_$]/.test(base) ? base || 'fn' : `fn_${base}`
  let candidate = prefixed || 'fn'
  let counter = 1
  while (used.has(candidate)) {
    candidate = `${prefixed}_${counter++}`
  }
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

export const prepareFunctionsWorkspace = async (
  options: FunctionsBuilderOptions,
): Promise<FunctionsBuilderResult> => {
  const { functions, outDir, projectRoot, reporter, runtime } = options

  const idMap = new Map<string, string>()

  if (!functions.length) {
    try {
      await fs.rm(outDir, { recursive: true, force: true })
    } catch (error) {
      reporter.warn(
        `[gatsby-adapter-firebase] Failed to clean empty functions directory ${toPosix(outDir)}: ${(error as Error).message}`,
      )
    }
    return { prepared: null, idMap }
  }

  if (!isPathWithin(projectRoot, outDir)) {
    throw new Error('[gatsby-adapter-firebase] functionsOutDir must be within the project root')
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
    const deployedId = sanitizeFunctionName(fn.functionId, usedNames)
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
            return { file, isEntry, error: String(error) }
          }
        }),
      ),
    )

    const missingFiles = copyResults.filter(({ error }) => error != null)
    if (missingFiles.length > 0) {
      // Skip the function if entry file is missing, or +2 required files are missing
      const skip = missingFiles.some(({ isEntry }, i) => isEntry || i > 1)
      reporter.warn(
        `[gatsby-adapter-firebase] ${skip ? 'Skipping function' : 'Function'} \`${fn.functionId}\`: some required files could not be copied:${
          [''].concat(missingFiles.map(({ file, error }) => `${toPosix(file)}: ${error}`)).join('\n · ')
        }`,
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
    return { prepared: null, idMap }
  }

  const indexSource = `// Auto-generated by gatsby-adapter-firebase. Do not edit.
'use strict'

const { onRequest } = require('firebase-functions/v2/https')

const defaultOptions = {
  region: ${JSON.stringify(options.region)}
}

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'

const createHttpsFunction = (handlerExports) => {
  const handler = handlerExports?.default || handlerExports
  const handlerOptions = handlerExports?.options
  const options = isPlainObject(handlerOptions)
    ? { ...defaultOptions, ...handlerOptions }
    : defaultOptions
  return onRequest(options, handler)
}

${exportsInfo
    .map((fn) => `exports.${fn.deployedId} = createHttpsFunction(require('${fn.relativeEntry}'))`)
    .join('\n')}
`
  await fs.writeFile(path.join(outDir, 'index.js'), indexSource, 'utf8')

  const enginesEntry = runtimeToEngineConstraint(runtime)
  const packageJson = {
    type: 'commonjs',
    ...(enginesEntry ? { engines: { node: enginesEntry } } : {}),
    dependencies: {
      'firebase-functions': '^6.0.0',
    },
  }

  await fs.writeFile(
    path.join(outDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf8',
  )

  return { prepared: { exports: exportsInfo, copiedFiles }, idMap }
}
