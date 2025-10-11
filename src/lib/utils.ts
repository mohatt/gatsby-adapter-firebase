import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { PackageJson } from './types.js'
import crypto from 'node:crypto'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

export const resolveDistPath = (distPath: string) => {
  // assumes the file is under `dist/`
  return path.join(__dirname, distPath)
}

export const readPackageJson = (): PackageJson => {
  const require = createRequire(__filename)
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

export interface HashFileOptions {
  chunkSize?: number
}

export const hashFile = async (file: string, options?: HashFileOptions) => {
  const highWaterMark = options?.chunkSize ?? 64 * 1024
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(file, { highWaterMark })
  try {
    for await (const chunk of stream) {
      hash.update(chunk)
    }
    return hash.digest('hex')
  } finally {
    stream.destroy()
  }
}
