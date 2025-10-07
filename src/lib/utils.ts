import path from 'node:path'
import { createRequire } from 'node:module'
import type { PackageJson } from './types.js'

export const toArray = <T>(value: T | T[] | undefined): T[] =>
  Array.isArray(value) ? value : value != null ? [value] : []

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
