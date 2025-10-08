import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import type { Bucket, File } from '@google-cloud/storage'
import type { FunctionHandler, Request, Response } from './types.js'

type AllowedMethod = 'GET' | 'HEAD'
const ALLOWED_METHODS: readonly AllowedMethod[] = ['GET', 'HEAD']
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405

let cachedBucket: Bucket | null | undefined

const getBucket = () => {
  if (cachedBucket !== undefined) return cachedBucket
  try {
    const app = initializeApp()
    cachedBucket = getStorage(app).bucket() as unknown as Bucket
  } catch (error) {
    cachedBucket = null
    console.error(`[gatsby-adapter-firebase] Failed to initialize Firebase Storage:`, error)
  }
  return cachedBucket
}

const normalizePath = (value: string | undefined) => {
  if (!value || value === '/') return '/'

  // strip query and hash
  const index = value.search(/[?#]/)
  let normalized = index === -1 ? value : value.slice(0, index)

  // ensure one leading slash and no duplicate slashes
  normalized = `/${normalized}`.replace(/\/{2,}/g, '/')

  // no trailing slashes
  return normalized !== '/' && normalized.endsWith('/') //
    ? normalized.slice(0, -1)
    : normalized
}

const getRequestPath = (req: Request) => {
  const candidate =
    (typeof req.originalUrl === 'string' && req.originalUrl) ||
    (typeof req.path === 'string' && req.path) ||
    (typeof req.url === 'string' && req.url) ||
    '/'
  return normalizePath(candidate)
}

const toBuffer = (chunk: unknown, encoding?: unknown): Buffer | null => {
  if (chunk == null) return null
  if (Buffer.isBuffer(chunk)) return chunk
  if (typeof chunk === 'string') {
    return Buffer.from(
      chunk,
      typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined,
    )
  }
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  return null
}

const collectHeaders = (res: Response) =>
  Object.entries(res.getHeaders())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }))

const createCacheKey = (functionId: string, req: Request) => {
  const path = getRequestPath(req)
  const encoded = Buffer.from(path).toString('base64url')
  return `gatsby-adapter-firebase/${functionId}/${encoded}.json`
}

interface CachedPayload {
  status: number
  headers: Array<{ name: string; value: unknown }>
  encoding: 'base64'
  body: string
}

const readCachedResponse = async (file: File): Promise<CachedPayload | null> => {
  try {
    const [exists] = await file.exists()
    if (!exists) return null
    const [content] = await file.download({ validation: false })
    return JSON.parse(content.toString('utf8'))
  } catch (error) {
    console.error(
      `[gatsby-adapter-firebase] Failed to read cached response for ${file.name}:`,
      error,
    )
  }
  return null
}

const writeCachedResponse = async (file: File, payload: CachedPayload) => {
  try {
    await file.save(JSON.stringify(payload), {
      resumable: false,
      contentType: 'application/json',
    })
  } catch (error) {
    console.error(
      `[gatsby-adapter-firebase] Failed to write cached response for ${file.name}:`,
      error,
    )
  }
}

const respondWithCache = (res: Response, cached: CachedPayload, method: AllowedMethod) => {
  for (const header of cached.headers) {
    if (!header || typeof header.name !== 'string') continue
    if (header.value === undefined) continue
    res.set(header.name, String(header.value))
  }
  res.status(cached.status)

  if (method === 'HEAD') {
    res.end()
    return
  }

  if (cached.encoding === 'base64') {
    res.send(Buffer.from(cached.body, 'base64'))
    return
  }

  res.send(cached.body)
}

export const createCachedHandler = (handler: FunctionHandler, id: string): FunctionHandler => {
  return async (req, res) => {
    const method = (req.method?.toUpperCase() as AllowedMethod) ?? 'GET'
    if (!ALLOWED_METHODS.includes(method)) {
      res.status(HTTP_STATUS_METHOD_NOT_ALLOWED)
      res.set('allow', ALLOWED_METHODS.join(', '))
      res.set('cache-control', 'no-store')
      res.send('Method Not Allowed')
      return
    }

    const bucket = getBucket()
    if (!bucket) {
      await handler(req, res)
      return
    }

    const cacheKey = createCacheKey(id, req)
    const file = bucket.file(cacheKey)

    const cached = await readCachedResponse(file)
    if (cached) {
      respondWithCache(res, cached, method)
      return
    }

    if (method !== 'GET') {
      await handler(req, res)
      return
    }

    const chunks: Buffer[] = []
    const originalWrite = res.write
    const originalEnd = res.end

    res.write = function writeOverride(this: Response, chunk: unknown, encoding?: unknown) {
      const normalized = toBuffer(chunk, encoding)
      if (normalized) chunks.push(normalized)
      // eslint-disable-next-line prefer-rest-params
      return originalWrite.apply(this, arguments)
    }

    res.end = function endOverride(this: Response, chunk?: unknown, encoding?: unknown) {
      const normalized = toBuffer(chunk, encoding)
      if (normalized) chunks.push(normalized)
      // eslint-disable-next-line prefer-rest-params
      return originalEnd.apply(this, arguments)
    }

    let done = false
    const finalize = async () => {
      if (done) return
      done = true
      res.removeListener('finish', finalize)
      res.removeListener('close', finalize)
      res.write = originalWrite
      res.end = originalEnd

      const statusCode = res.statusCode
      if (statusCode < 200 || statusCode >= 300) {
        return
      }

      const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0)
      const payload: CachedPayload = {
        status: statusCode,
        headers: collectHeaders(res),
        encoding: 'base64',
        body: bodyBuffer.toString('base64'),
      }

      await writeCachedResponse(file, payload)
    }

    res.on('finish', finalize)
    res.on('close', finalize)

    try {
      await handler(req, res)
    } finally {
      res.write = originalWrite
      res.end = originalEnd
      res.removeListener('finish', finalize)
      res.removeListener('close', finalize)
    }
  }
}
