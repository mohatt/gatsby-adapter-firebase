import { logger } from 'firebase-functions/v2'
import { getStorage } from 'firebase-admin/storage'
import type { Bucket } from '@google-cloud/storage'
import type { OutgoingHttpHeader } from 'node:http'
import type { FunctionHandler, FunctionMetadata, Request, Response } from './types.js'
import { getDefaultFirebaseApp, prepareRequest } from './utils.js'

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

interface CachedResponse {
  metadata: CachedResponseMetadata
  body: Buffer
}

class CacheManager {
  private bucketPromise?: Promise<Bucket | null>

  constructor(private readonly meta: Pick<FunctionMetadata, 'id' | 'version'>) {}

  private async resolveBucket(): Promise<Bucket | null> {
    try {
      const app = getDefaultFirebaseApp()
      const bucket = getStorage(app).bucket()
      const [exists] = await bucket.exists()
      if (!exists) {
        throw new Error(`Storage bucket ${bucket.name} does not exist`)
      }
      return bucket as unknown as Bucket
    } catch (error) {
      logger.error(`[gatsby-adapter-firebase] Failed to initialize Firebase Storage:`, error)
      return null
    }
  }

  async getBucket(): Promise<Bucket | null> {
    if (!this.bucketPromise) {
      this.bucketPromise = this.resolveBucket().then((bucket) => {
        if (!bucket) {
          this.bucketPromise = undefined
        }
        return bucket
      })
    }
    return this.bucketPromise
  }

  // encode function id + normalized path into a stable bucket object key
  createCacheKey(req: Request, normalizeTrailing: boolean) {
    const path =
      (typeof req.originalUrl === 'string' && req.originalUrl) ||
      (typeof req.path === 'string' && req.path) ||
      (typeof req.url === 'string' && req.url) ||
      '/'
    const normalized = normalizeTrailing ? path.replace(/\/+$/u, '') : path
    const encoded = Buffer.from(normalized).toString('base64url')
    // `meta.version` ensures that the cache is invalidated when the function is updated
    return `.gatsby-adapter-firebase/${this.meta.id}/${this.meta.version}/${encoded}.bin`
  }

  async readResponse(key: string): Promise<CachedResponse | null> {
    const bucket = await this.getBucket()
    if (!bucket) return null
    try {
      const file = bucket.file(key)
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
      logger.error(`[gatsby-adapter-firebase] Failed to read cached response for ${key}:`, error)
    }
    return null
  }

  async writeResponse(key: string, metadata: CachedResponseMetadata, body: Buffer) {
    const bucket = await this.getBucket()
    if (!bucket) return
    try {
      const file = bucket.file(key)
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
      logger.error(`[gatsby-adapter-firebase] Failed to write cached response for ${key}:`, error)
    }
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

// wrap the original handler with Firebase Storage backed response caching
export const createCachedHandler = (
  handler: FunctionHandler,
  meta: Pick<FunctionMetadata, 'id' | 'version'>,
): FunctionHandler => {
  // create a new instance of CacheManager for each handler
  const cacheManager = new CacheManager(meta)

  return async (originalReq, res) => {
    const method = (originalReq.method?.toUpperCase() as AllowedMethod) ?? 'GET'
    if (!ALLOWED_METHODS.includes(method)) {
      res.status(HTTP_STATUS_METHOD_NOT_ALLOWED)
      res.set('allow', ALLOWED_METHODS.join(', '))
      res.set('cache-control', 'no-store')
      res.send('Method Not Allowed')
      return
    }

    const req = prepareRequest(originalReq, true)
    const bucket = await cacheManager.getBucket()
    if (!bucket) {
      res.set(CACHE_METADATA_HEADER, CACHE_PASS_VALUE)
      if (!res.hasHeader('cache-control')) {
        res.set('cache-control', CACHE_CONTROL_UNCACHEABLE)
      }
      await handler(req, res)
      return
    }

    // Gatsby replies with 200 for both /foo and /foo/ so we need to normalize the path
    // to prevent double cache for /foo and /foo/
    const normalizeTrailing = meta.id === 'ssr-engine-cached'
    const cacheKey = cacheManager.createCacheKey(req, normalizeTrailing)
    const cached = await cacheManager.readResponse(cacheKey)
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

      void cacheManager.writeResponse(cacheKey, metadata, body)
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
