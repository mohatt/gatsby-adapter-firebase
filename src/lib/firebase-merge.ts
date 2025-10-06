import type {
  FirebaseJson,
  FunctionsEntry,
  HostingConfig,
  HostingHeader,
  HostingRedirect,
  HostingRewrite,
} from './types.js'
import { readJsonIfExists, toArray, writeIfChanged } from './utils.js'

export type MergeFirebaseJsonOptions = {
  filePath: string
  hostingTarget: string
  publicDir: string
  redirects: HostingRedirect[]
  rewrites: HostingRewrite[]
  headers: HostingHeader[]
  functionsEntry?: FunctionsEntry
}

const DEFAULT_IGNORE = ['**/.*', '**/node_modules/**', 'firebase.json']

const ensureArrayShape = <T>(
  value: T | T[] | undefined,
): { list: T[]; originalWasArray: boolean } => {
  const arr = toArray(value)
  return { list: arr, originalWasArray: Array.isArray(value) }
}

const restoreShape = <T>(arr: T[], originalWasArray: boolean) => {
  if (!arr.length) return undefined
  if (arr.length === 1 && !originalWasArray) {
    return arr[0]
  }
  return arr
}

const mergeHostingBlock = (
  existing: HostingConfig | undefined,
  target: string,
  publicDir: string,
  redirects: HostingRedirect[],
  rewrites: HostingRewrite[],
  headers: HostingHeader[],
): HostingConfig => {
  const block: HostingConfig = existing ? { ...existing } : { target }
  block.target = target
  block.public = publicDir
  if (!block.ignore) {
    block.ignore = [...DEFAULT_IGNORE]
  }
  block.redirects = [...redirects]
  block.rewrites = [...rewrites]
  block.headers = [...headers]
  return block
}

const mergeFunctionsEntry = (
  existing: FunctionsEntry | undefined,
  incoming: FunctionsEntry,
): FunctionsEntry => {
  if (!existing) return { ...incoming }
  const merged: FunctionsEntry = { ...existing, ...incoming }
  merged.codebase = incoming.codebase
  return merged
}

export const mergeFirebaseJson = async (options: MergeFirebaseJsonOptions) => {
  const { filePath, hostingTarget, publicDir, redirects, rewrites, headers, functionsEntry } =
    options
  const current = (await readJsonIfExists<FirebaseJson>(filePath)) ?? {}

  const { list: hostingList, originalWasArray: hostingWasArray } = ensureArrayShape(current.hosting)
  let hostingBlock = hostingList.find((entry) => entry.target === hostingTarget)
  hostingBlock = mergeHostingBlock(
    hostingBlock,
    hostingTarget,
    publicDir,
    redirects,
    rewrites,
    headers,
  )
  const nextHostingList = hostingList.filter((entry) => entry.target !== hostingTarget)
  nextHostingList.push(hostingBlock)
  nextHostingList.sort((a, b) => a.target.localeCompare(b.target))

  const { list: functionsList, originalWasArray: functionsWasArray } = ensureArrayShape(
    current.functions,
  )
  const nextFunctionsList = functionsList.filter(
    (entry) => entry.codebase !== functionsEntry?.codebase,
  )

  if (functionsEntry) {
    const existingEntry = functionsList.find((entry) => entry.codebase === functionsEntry.codebase)
    nextFunctionsList.push(mergeFunctionsEntry(existingEntry, functionsEntry))
    nextFunctionsList.sort((a, b) => a.codebase.localeCompare(b.codebase))
  }

  const merged: FirebaseJson = {
    ...current,
    hosting: restoreShape(nextHostingList, hostingWasArray),
    functions: restoreShape(nextFunctionsList, functionsWasArray),
  }

  if (!functionsEntry && nextFunctionsList.length === 0) {
    delete merged.functions
  }

  const contents = `${JSON.stringify(merged, null, 2)}\n`
  const wrote = await writeIfChanged(filePath, contents)
  return { wrote, merged }
}
