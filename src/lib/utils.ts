import path from 'node:path'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { PackageJson } from './types.js'

export const toArray = <T>(value: T | T[] | undefined): T[] =>
  Array.isArray(value) ? value : value ? [value] : []

export const readJsonIfExists = async <T>(file: string): Promise<T | undefined> => {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export const writeIfChanged = async (file: string, contents: string) => {
  const previous = await fs.readFile(file, 'utf8').catch(() => '')
  if (previous === contents) {
    return false
  }
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, contents)
  return true
}

export const ensureEmptyDir = async (dir: string) => {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

export const copyFileWithDirs = async (src: string, dest: string) => {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
}

export const toPosix = (value: string) => value.split(path.sep).join('/')

export const relativeToPosix = (from: string, to: string) => toPosix(path.relative(from, to))

export const isPathWithin = (parent: string, child: string) => {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  const relative = path.relative(resolvedParent, resolvedChild)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export const readPackageJson = (): PackageJson => {
  const require = createRequire(import.meta.url)
  // assumes the file is under `dist/`
  return require('../package.json')
}

let pLimitPromise: Promise<(typeof import('p-limit'))['default']> | undefined

// why? for compatibility with CJS build, since p-limit is pure ESM
export const pLimit = async (concurrency: number) => {
  if (!pLimitPromise) {
    pLimitPromise = import('p-limit').then((mod) => mod.default)
  }
  return pLimitPromise.then((limiter) => limiter(concurrency))
}
