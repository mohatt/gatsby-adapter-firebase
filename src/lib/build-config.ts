import path from 'node:path'
import fs from 'node:fs/promises'
import stableStringify from 'safe-stable-stringify'
import type { FirebaseJson, FirebaseFunctionsJson, FirebaseHostingJson } from './types.js'
import { AdaptorError } from './reporter.js'

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

const ensureArrayShape = <T>(value: T | T[] | undefined): [values: T[], wasArray: boolean] => {
  if (Array.isArray(value)) return [value, true]
  return [value != null ? [value] : [], false]
}

const restoreShape = <T>(list: T[], wasArray: boolean): T | T[] | undefined => {
  if (!list.length) return undefined
  if (list.length === 1 && !wasArray) {
    return list[0]
  }
  return list
}

/**
 * Merges a config entry into a list by unique key.
 * - Keeps sorted by the given key
 * - Preserves original entry shape
 */
const mergeEntryByKey = <T>(
  value: T | T[] | undefined,
  newEntry: T | undefined,
  key: keyof T,
  merge: (current: T | undefined, next: T) => T,
): T | T[] | undefined => {
  const [list, wasArray] = ensureArrayShape(value)
  if (!newEntry) return restoreShape(list, wasArray)

  const newKey = newEntry[key]

  // Single entry with no key → overwrite it. if we preserve it,
  // we'll end up with an array entry with no key which is not valid firebase config
  if (list.length === 1 && list[0][key] == null) {
    return restoreShape([merge(list[0], newEntry)], wasArray)
  }

  // Entries with a defined key → remove same-key entry if any, then merge/push new
  const nextList = list.filter((e) => e[key] !== newKey)
  const currentEntry = list.find((e) => e[key] === newKey)
  nextList.push(merge(currentEntry, newEntry))
  nextList.sort((a, b) => String(a[key]).localeCompare(String(b[key])))

  return restoreShape(nextList, wasArray)
}

const mergeHostingEntry = <T extends FirebaseHostingJson>(current: T, received: T): T => {
  const merged: T = { ...current, ...received }
  if (!merged.ignore) {
    merged.ignore = [...DEFAULT_HOSTING_IGNORE]
  }
  return merged
}

const mergeFunctionsEntry = <T extends FirebaseFunctionsJson>(current: T, received: T): T => {
  const merged: T = { ...current, ...received }
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

  const config: FirebaseJson = {
    ...current,
    hosting: mergeEntryByKey<FirebaseHostingJson>(
      current.hosting,
      hosting,
      'target',
      mergeHostingEntry,
    ),
  }

  if (functions) {
    const mergedFunctions = mergeEntryByKey<FirebaseFunctionsJson>(
      current.functions,
      functions,
      'codebase',
      mergeFunctionsEntry,
    )
    if (mergedFunctions) {
      config.functions = mergedFunctions
    }
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
