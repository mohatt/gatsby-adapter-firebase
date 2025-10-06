import fs from 'node:fs/promises'
import path from 'node:path'
import type { FirebaseJson, FunctionsEntry, HostingEntry } from './types.js'
import { AdaptorError } from './reporter.js'
import { toArray } from './utils.js'

export type MergeFirebaseJsonOptions = {
  hostingEntry: HostingEntry
  functionsEntry?: FunctionsEntry
}

export type MergeFirebaseJsonResult = {
  wrote: number
  config: FirebaseJson
}

const DEFAULT_IGNORE = ['**/.*', '**/node_modules/**', 'firebase.json']

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
  current: HostingEntry | undefined,
  received: HostingEntry,
): HostingEntry => {
  const merged: HostingEntry = { ...current, ...received }
  if (!merged.ignore) {
    merged.ignore = [...DEFAULT_IGNORE]
  }
  return merged
}

const mergeFunctionsEntry = (
  current: FunctionsEntry | undefined,
  received: FunctionsEntry,
): FunctionsEntry => {
  return { ...current, ...received }
}

export const mergeFirebaseJson = async (
  filePath: string,
  options: MergeFirebaseJsonOptions,
): Promise<MergeFirebaseJsonResult> => {
  const { hostingEntry, functionsEntry } = options
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
  const currHostingEntry = hostingList.find((e) => e.target === hostingEntry.target)
  const nextHostingList = hostingList.filter((e) => e.target !== hostingEntry.target)
  nextHostingList.push(mergeHostingEntry(currHostingEntry, hostingEntry))
  nextHostingList.sort((a, b) => a.target.localeCompare(b.target))

  const [functionsList, functionsWasArray] = ensureArrayShape(current.functions)
  const nextFunctionsList = functionsList.filter((e) => e.codebase !== functionsEntry?.codebase)
  if (functionsEntry) {
    const currFunctionsEntry = functionsList.find((e) => e.codebase === functionsEntry.codebase)
    nextFunctionsList.push(mergeFunctionsEntry(currFunctionsEntry, functionsEntry))
    nextFunctionsList.sort((a, b) => a.codebase.localeCompare(b.codebase))
  }

  const config: FirebaseJson = {
    ...current,
    hosting: restoreShape(nextHostingList, hostingWasArray),
    functions: restoreShape(nextFunctionsList, functionsWasArray),
  }

  if (!functionsEntry && nextFunctionsList.length === 0) {
    delete config.functions
  }

  const configJSON = `${JSON.stringify(config, null, 2)}\n`
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
