import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import type { Bucket, File } from '@google-cloud/storage'
import type { OutgoingHttpHeader } from 'node:http'
import type { FunctionHandler, Request, Response } from './types.js'

export interface CachedResponseMetadata {
  status: number
  headers: Array<{ name: string; value: OutgoingHttpHeader }>
}

type AllowedMethod = 'GET' | 'HEAD'
const ALLOWED_METHODS: readonly AllowedMethod[] = ['GET', 'HEAD']
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405

const CACHE_CONTROL_CACHEABLE = 'public, max-age=0, must-revalidate'
const CACHE_CONTROL_UNCACHEABLE = 'no-store'
const CACHE_METADATA_HEADER = 'X-Gatsby-Firebase-Cache'
const CACHE_HIT_VALUE = 'HIT'
const CACHE_MISS_VALUE = 'MISS'
const CACHE_PASS_VALUE = 'PASS'

// Hop-by-hop headers are not intended for cached payloads; filter them out.
const EXCLUDED_CACHE_HEADER_NAMES = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'set-cookie', // prevent cross-user cookie replay
  'content-length', // derived from body
  'x-gatsby-firebase-cache', // internal metadata
]

// used for storage object naming and error reporting
const PREFIX = 'gatsby-adapter-firebase'

let cachedBucket: Bucket | null | undefined

// lazily resolve and memoize the default storage bucket; cache null if initialization fails
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

// normalize the request path so equivalent URLs land on the same cache entry
const normalizePath = (value: string | undefined) => {
  if (!value || value === '/') return '/'
  // strip query and hash
  const index = value.search(/[?#]/)
  const normalized = index === -1 ? value : value.slice(0, index)
  // ensure one leading slash
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

const prepareRequest = (originalReq: Request) => {
  const req = Object.create(originalReq) as Request

  const assignIfString = (key: string) => {
    if (typeof req[key] === 'string') {
      req[key] = normalizePath(req[key])
    }
  }

  assignIfString('url')
  assignIfString('originalUrl')
  req.query = Object.create(null)
  void req.path // trigger getter for reparse
  return req
}

// convert any express chunk shape into a Buffer so we can concatenate responses safely
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

// capture cacheable headers (without hop-by-hop metadata) for storage
const createCachedHeaders = (res: Response, contentLength: number) => {
  const headers = Object.entries(res.getHeaders())
    .filter(([name, value]) => {
      if (!name || value == null) return false
      return !EXCLUDED_CACHE_HEADER_NAMES.includes(name.toLowerCase())
    })
    .map(([name, value]) => ({ name, value }))
  headers.push({ name: 'content-length', value: contentLength })
  headers.sort((a, b) => a.name.localeCompare(b.name))
  return headers
}

// encode function id + normalized path into a stable bucket object key
const createCacheKey = (functionId: string, req: Request) => {
  const path =
    (typeof req.originalUrl === 'string' && req.originalUrl) ||
    (typeof req.path === 'string' && req.path) ||
    (typeof req.url === 'string' && req.url) ||
    '/'
  const encoded = Buffer.from(path).toString('base64url')
  return `${PREFIX}/${functionId}/${encoded}.bin`
}

interface CachedResponse {
  metadata: CachedResponseMetadata
  body: Buffer
}

const readCachedResponse = async (file: File): Promise<CachedResponse | null> => {
  try {
    const [exists] = await file.exists()
    if (!exists) return null
    const [downloaded] = await file.download({ validation: false })
    const newlineIndex = downloaded.indexOf(0x0a) // '\n'
    if (newlineIndex === -1) {
      throw new Error(`Missing metadata delimiter`)
    }
    const metadata: CachedResponseMetadata = JSON.parse(
      downloaded.subarray(0, newlineIndex).toString('utf8'),
    )
    if (!metadata || typeof metadata.status !== 'number' || !Array.isArray(metadata.headers)) {
      throw new Error(`Invalid metadata`)
    }
    const body = downloaded.subarray(newlineIndex + 1)
    return { metadata, body }
  } catch (error) {
    console.error(`[${PREFIX}] Failed to read cached response for ${file.name}:`, error)
  }
  return null
}

// persist the captured payload for future hits
const writeCachedResponse = async (file: File, metadata: CachedResponseMetadata, body: Buffer) => {
  try {
    const header = `${JSON.stringify(metadata)}\n`
    const data = Buffer.concat([Buffer.from(header, 'utf8'), body])
    await file.save(data, {
      resumable: false,
      metadata: {
        contentType: 'application/octet-stream',
        metadata: { headerLength: header.length },
      },
    })
  } catch (error) {
    console.error(`[${PREFIX}] Failed to write cached response for ${file.name}:`, error)
  }
}

// cache successful/redirect/404 responses; everything else must re-run
const isCacheableStatus = (statusCode: number) =>
  (statusCode >= 200 && statusCode < 300) ||
  statusCode === 301 ||
  statusCode === 302 ||
  statusCode === 307 ||
  statusCode === 308 ||
  statusCode === 404

// Wrap the original handler with Firebase Storage backed response caching (2xx, 3xx, 404 only).
export const createCachedHandler = (handler: FunctionHandler, id: string): FunctionHandler => {
  return async (originalReq, res) => {
    const method = (originalReq.method?.toUpperCase() as AllowedMethod) ?? 'GET'
    if (!ALLOWED_METHODS.includes(method)) {
      res.status(HTTP_STATUS_METHOD_NOT_ALLOWED)
      res.set('allow', ALLOWED_METHODS.join(', '))
      res.set('cache-control', 'no-store')
      res.send('Method Not Allowed')
      return
    }

    const req = prepareRequest(originalReq)
    const bucket = getBucket()
    if (!bucket) {
      res.set(CACHE_METADATA_HEADER, CACHE_PASS_VALUE)
      if (!res.hasHeader('cache-control')) {
        res.set('cache-control', CACHE_CONTROL_UNCACHEABLE)
      }
      await handler(req, res)
      return
    }

    const cacheKey = createCacheKey(id, req)
    const file = bucket.file(cacheKey)

    const cached = await readCachedResponse(file)
    if (cached) {
      // apply cached headers to the response
      for (const header of cached.metadata.headers) {
        // we just pass the value we got from the cache, express should handle the rest
        res.set(header.name, header.value as any)
      }
      res.set(CACHE_METADATA_HEADER, CACHE_HIT_VALUE)
      res.status(cached.metadata.status)

      if (method === 'HEAD') {
        res.end()
        return
      }

      res.end(cached.body)
      return
    }

    let pendingWrites = 0
    let totalLength = 0
    const bufferList: Buffer[] = []
    // skip buffering HEAD requests
    // but we still have to run the same logic for both GET and HEAD for perfect header parity
    const shouldBuffer = method === 'GET'

    const addChunk = (chunk: unknown, encoding?: unknown) => {
      pendingWrites--
      if (shouldBuffer) {
        const buffer = toBuffer(chunk, encoding)
        if (buffer) {
          bufferList.push(buffer)
          totalLength += buffer.length
        }
      }
    }

    // intercept writes to buffer the body and set cache-control once status code is known
    const buildChunkArgs = (chunk: unknown, a?: unknown, b?: unknown) => {
      pendingWrites++

      // node allows: write(chunk), write(chunk, cb), write(chunk, encoding), write(chunk, encoding, cb)
      const encoding = typeof a === 'string' ? (a as BufferEncoding) : undefined
      const cb = (typeof a === 'function' ? a : typeof b === 'function' ? b : undefined) as
        | ((err?: Error) => void)
        | undefined

      if (!res.headersSent) {
        res.set(CACHE_METADATA_HEADER, CACHE_MISS_VALUE)
        if (!res.hasHeader('cache-control')) {
          const statusCode = res.statusCode ?? 200
          res.set(
            'cache-control',
            isCacheableStatus(statusCode) ? CACHE_CONTROL_CACHEABLE : CACHE_CONTROL_UNCACHEABLE,
          )
        }
      }

      // build safe argument list
      const callArgs = encoding ? [chunk, encoding] : [chunk]
      callArgs.push((err?: Error) => {
        cb?.(err)
        if (err == null) addChunk(chunk, encoding)
      })

      return callArgs
    }

    const originalWrite = res.write
    const originalEnd = res.end
    res.write = new Proxy(originalWrite, {
      apply(target, thisArg, args: [unknown]) {
        return Reflect.apply(target, thisArg, buildChunkArgs(...args))
      },
    })
    res.end = new Proxy(originalEnd, {
      apply(target, thisArg, args: [unknown]) {
        return Reflect.apply(target, thisArg, buildChunkArgs(...args))
      },
    })

    let done = false
    let queued = false

    const onClose = () => {
      if (done) return
      done = true
      cleanup()

      if (res.errored || !queued || pendingWrites > 0 || !shouldBuffer) {
        // aborted, errored, incomplete or head request -> skip
        return
      }

      // skip uncacheable responses
      const statusCode = res.statusCode
      if (!isCacheableStatus(statusCode)) {
        return
      }

      const body = Buffer.concat(bufferList, totalLength)
      const metadata: CachedResponseMetadata = {
        status: statusCode,
        headers: createCachedHeaders(res, totalLength),
      }

      void writeCachedResponse(file, metadata, body)
    }

    const onFinish = () => {
      queued = true

      // some providers might not emit 'close' and buffer the response
      if (pendingWrites === 0) {
        onClose()
      }
    }

    const cleanup = () => {
      res.off('finish', onFinish)
      res.off('close', onClose)
      res.write = originalWrite
      res.end = originalEnd
    }

    res.once('finish', onFinish)
    res.once('close', onClose)

    try {
      await handler(req, res)
    } catch (error) {
      cleanup()
      throw error
    }
  }
}
