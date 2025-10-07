import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import type { Bucket, File } from '@google-cloud/storage'
import type { FunctionHandler, Request, Response } from './types.js'

const ALLOWED_METHODS = new Set(['GET', 'HEAD'] as const)
const ALLOW_HEADER_VALUE = 'GET, HEAD'
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405

type AllowedMethod = 'GET' | 'HEAD'

let cachedBucket: Bucket | null | undefined

const getBucket = () => {
  if (cachedBucket !== undefined) return cachedBucket
  try {
    const app = initializeApp()
    cachedBucket = getStorage(app).bucket()
  } catch (error) {
    cachedBucket = null
    console.warn(
      '[gatsby-adapter-firebase] Failed to initialize Firebase Storage: ' +
        (error instanceof Error ? error.message : String(error)),
    )
  }
  return cachedBucket
}

const normalizePath = (value: string | undefined): string => {
  if (!value) return '/'
  const trimmed = value.startsWith('/') ? value : `/${value.replace(/^\/+/, '')}`
  return trimmed.replace(/\/{2,}/g, '/') || '/'
}

const stripQueryAndHash = (value: string): string => {
  const index = value.search(/[?#]/)
  return index === -1 ? value : value.slice(0, index)
}

const getRequestPath = (req: Request): string => {
  const candidate =
    (typeof req.path === 'string' && req.path) ||
    (typeof req.originalUrl === 'string' && req.originalUrl) ||
    (typeof req.url === 'string' && req.url) ||
    '/'
  return normalizePath(stripQueryAndHash(candidate))
}

const toBuffer = (chunk: unknown, encoding?: unknown): Buffer | null => {
  if (chunk == null) return null
  if (Buffer.isBuffer(chunk)) return chunk
  const normalizedEncoding = typeof encoding === 'string' ? encoding : undefined
  if (typeof chunk === 'string') return Buffer.from(chunk, normalizedEncoding)
  return Buffer.from(chunk as ArrayBufferLike)
}

const collectHeaders = (res: Response) =>
  Object.entries(res.getHeaders()).map(([name, value]) => ({ name, value }))

const createCacheKey = (functionId: string, req: Request) => {
  const path = getRequestPath(req)
  const encoded = Buffer.from(path).toString('base64url')
  return `gatsby-adapter/${functionId}/${encoded}.json`
}

type CachedPayload = {
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
    return JSON.parse(content.toString('utf8')) as CachedPayload
  } catch (error) {
    throw error
  }
}

const writeCachedResponse = async (file: File, payload: CachedPayload, cacheKey: string) => {
  try {
    await file.save(JSON.stringify(payload), {
      resumable: false,
      contentType: 'application/json',
    })
  } catch (error) {
    console.warn(
      '[gatsby-adapter-firebase] Failed to write cached response for ' +
        cacheKey +
        ': ' +
        (error instanceof Error ? error.message : String(error)),
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

const normalizeMethod = (method?: string): string =>
  typeof method === 'string' ? method.toUpperCase() : 'GET'

export const createCachedHandler = (handler: FunctionHandler, id: string): FunctionHandler => {
  return async (req, res) => {
    const method = normalizeMethod(req.method) as AllowedMethod
    if (!ALLOWED_METHODS.has(method)) {
      res.status(HTTP_STATUS_METHOD_NOT_ALLOWED)
      res.set('allow', ALLOW_HEADER_VALUE)
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

    try {
      const cached = await readCachedResponse(file)
      if (cached) {
        respondWithCache(res, cached, method)
        return
      }
    } catch (error) {
      console.warn(
        '[gatsby-adapter-firebase] Failed to read cached response for ' +
          cacheKey +
          ': ' +
          (error instanceof Error ? error.message : String(error)),
      )
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
      return originalWrite.apply(this, arguments as unknown as Parameters<Response['write']>)
    }

    res.end = function endOverride(this: Response, chunk?: unknown, encoding?: unknown) {
      const normalized = toBuffer(chunk, encoding)
      if (normalized) chunks.push(normalized)
      return originalEnd.apply(this, arguments as unknown as Parameters<Response['end']>)
    }

    let finalized = false
    const finalize = async () => {
      if (finalized) return
      finalized = true
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

      await writeCachedResponse(file, payload, cacheKey)
    }

    res.on('finish', finalize)
    res.on('close', finalize)

    try {
      await handler(req, res)
    } catch (error) {
      res.write = originalWrite
      res.end = originalEnd
      res.removeListener('finish', finalize)
      res.removeListener('close', finalize)
      throw error
    }
  }
}
