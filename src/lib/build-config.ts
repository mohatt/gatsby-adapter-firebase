import path from 'node:path'
import fs from 'node:fs/promises'
import stableStringify from 'safe-stable-stringify'
import type { FirebaseJson, FirebaseFunctionsJson, FirebaseHostingJson } from './types.js'
import { AdaptorError } from './reporter.js'
import { toArray } from './utils.js'

export interface BuildConfigArgs {
  hosting: FirebaseHostingJson
  functions?: FirebaseFunctionsJson
}

export interface BuildConfigResult {
  wrote: number
  config: FirebaseJson
}

// Firebase default hosting ignore
const DEFAULT_HOSTING_IGNORE = ['**/.*', '**/node_modules/**', 'firebase.json']

// Firebase default functions ignore
const DEFAULT_FUNCTIONS_IGNORE = [
  'node_modules',
  '.git',
  'firebase-debug.log',
  'firebase-debug.*.log',
  '*.local',
]

const ensureArrayShape = <T>(value: T | T[] | undefined) => {
  const arr = toArray(value)
  return [arr, Array.isArray(value)] as [values: T[], wasArray: boolean]
}

const restoreShape = <T>(arr: T[], wasArray: boolean) => {
  if (!arr.length) return undefined
  if (arr.length === 1 && !wasArray) {
    return arr[0]
  }
  return arr
}

const mergeHostingEntry = (
  current: FirebaseHostingJson | undefined,
  received: FirebaseHostingJson,
): FirebaseHostingJson => {
  const merged: FirebaseHostingJson = { ...current, ...received }
  if (!merged.ignore) {
    merged.ignore = [...DEFAULT_HOSTING_IGNORE]
  }
  return merged
}

const mergeFunctionsEntry = (
  current: FirebaseFunctionsJson | undefined,
  received: FirebaseFunctionsJson,
): FirebaseFunctionsJson => {
  const merged: FirebaseFunctionsJson = { ...current, ...received }
  if (!merged.ignore) {
    merged.ignore = [...DEFAULT_FUNCTIONS_IGNORE]
  }
  return merged
}

export const buildConfig = async (
  filePath: string,
  args: BuildConfigArgs,
): Promise<BuildConfigResult> => {
  const { hosting, functions } = args
  let currentJSON: string | null = null
  let current: FirebaseJson = {}
  try {
    currentJSON = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new AdaptorError(`Failed to read ${filePath}`, error)
    }
    currentJSON = null
  }

  if (currentJSON != null) {
    try {
      current = JSON.parse(currentJSON)
    } catch (error) {
      throw new AdaptorError(`Failed to parse ${filePath}`, error)
    }
  }

  const [hostingList, hostingWasArray] = ensureArrayShape(current.hosting)
  const currHostingEntry = hostingList.find((e) => e.target === hosting.target)
  const nextHostingList = hostingList.filter((e) => e.target !== hosting.target)
  nextHostingList.push(mergeHostingEntry(currHostingEntry, hosting))
  nextHostingList.sort((a, b) => a.target.localeCompare(b.target))

  const [functionsList, functionsWasArray] = ensureArrayShape(current.functions)
  const nextFunctionsList = functionsList.filter((e) => e.codebase !== functions?.codebase)
  if (functions) {
    const currFunctionsEntry = functionsList.find((e) => e.codebase === functions.codebase)
    nextFunctionsList.push(mergeFunctionsEntry(currFunctionsEntry, functions))
    nextFunctionsList.sort((a, b) => a.codebase.localeCompare(b.codebase))
  }

  const config: FirebaseJson = {
    ...current,
    hosting: restoreShape(nextHostingList, hostingWasArray),
    functions: restoreShape(nextFunctionsList, functionsWasArray),
  }

  if (!functions && nextFunctionsList.length === 0) {
    delete config.functions
  }

  const configJSON = `${stableStringify(config, null, 2)}\n`
  if (configJSON === currentJSON) {
    return { wrote: 0, config }
  }

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, configJSON)
  } catch (error) {
    throw new AdaptorError(`Failed to write ${filePath}`, error)
  }

  return { wrote: configJSON.length, config }
}
