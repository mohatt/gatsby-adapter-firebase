import _ from 'lodash'
import express from 'express'
import request from 'supertest'
import { createCachedFunction } from '../src/lib/runtime.js'
import type { FunctionHandler } from '../src/lib/runtime/types.js'

const cache = new Map<string, { file: Buffer; metadata: object }>()

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({
    bucket: () => ({
      exists: vi.fn().mockResolvedValue([true]),
      file: (name: string) => ({
        async exists(): Promise<[boolean]> {
          return [cache.has(name)]
        },
        async download(): Promise<[Buffer]> {
          if (!cache.has(name)) {
            throw Object.assign(new Error('Not Found'), { code: 404 })
          }
          const payload = cache.get(name)
          if (!payload) {
            throw new Error(`No stored payload for ${name}`)
          }
          return [Buffer.from(payload.file)]
        },
        async save(data: string | Buffer, options?: { metadata?: object }) {
          const file = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
          const { metadata } = options ?? {}
          cache.set(name, { file, metadata })
        },
      }),
    }),
  })),
}))

const createTestApp = (id: string, handler: FunctionHandler) => {
  const mockHandler = vi.fn(handler)
  const mockFunction = vi.fn(
    createCachedFunction(mockHandler, {
      id,
      name: `${id}-fn`,
      version: 'test-version',
      generator: 'test',
    }),
  )
  const server = express().disable('x-powered-by')
  server.all('*', (req, res) => {
    Promise.resolve(mockFunction(req as any, res)).catch((error) => {
      res.statusCode = 500
      res.end(error.message)
    })
  })
  return { handler: mockHandler, fn: mockFunction, agent: request(server) } as const
}

const assertResponse = (
  res: request.Test | request.Response,
  key: string,
): void | Promise<void> => {
  if ('then' in res) return res.then((r) => assertResponse(r, key))
  const snap = _.pick(res, ['status', 'headers', 'text', 'body', 'type'])
  if (snap.headers.date) snap.headers = { ...snap.headers, date: '<any>' }
  expect(snap).toMatchSnapshot(`response[${key}]`)
}

const assertCacheState = (encoding: BufferEncoding = 'utf8') => {
  const decodedCache = new Map(
    [...cache.entries()].map(([key, entry]) => {
      const { file, metadata } = entry
      const newlineIndex = file.indexOf(0x0a)
      const header = JSON.parse(file.subarray(0, newlineIndex).toString('utf8'))
      const body = file.subarray(newlineIndex + 1).toString(encoding)
      return [key, { file: { header, body }, metadata }]
    }),
  )
  expect(decodedCache).toMatchSnapshot('cache')
}

describe('createCachedFunction()', () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  it('serves streaming responses correctly', async () => {
    const { handler, agent } = createTestApp('function-id', async (_req, res) => {
      res.statusCode = 200
      res.setHeader('Test-Header', 'test-value')
      res.write('hello')
      res.write(', ')
      res.end('world')
    })
    await assertResponse(agent.get('/hello?query=ignore'), 'miss')
    await assertResponse(agent.get('/hello?param=ignored'), 'hit')
    expect(handler).toHaveBeenCalledTimes(1)
    assertCacheState()
  })

  it('does not cache non-cacheable status codes', async () => {
    const { handler, agent } = createTestApp('non-cacheable', async (_req, res) => {
      res.statusCode = 500
      res.end('error')
    })
    await assertResponse(agent.get('/error'), 'miss')
    await assertResponse(agent.get('/error'), 'repeat')
    expect(handler).toHaveBeenCalledTimes(2)
    assertCacheState()
  })

  it('serves cached GET bodies to HEAD requests', async () => {
    const { handler, agent } = createTestApp('head', async (_req, res) => {
      res.statusCode = 200
      res.end('payload')
    })
    await assertResponse(agent.get('/head'), 'get')
    await assertResponse(agent.head('/head'), 'head')
    expect(handler).toHaveBeenCalledTimes(1)
    assertCacheState()
  })

  it('strips query strings before invoking the wrapped handler', async () => {
    const { handler, agent } = createTestApp('strip-query', async (_req, res) => {
      res.status(204).end()
    })

    await agent.get('/stripped/path?foo=bar&baz=qux')
    const [req] = handler.mock.lastCall ?? []
    expect(req).toBeDefined()
    expect(req.url).toBe('/stripped/path')
    expect(req.originalUrl).toBe('/stripped/path')
    expect(req.query).toEqual({})
    expect((req as any)._parsedUrl).toMatchObject({
      search: null,
      query: null,
      path: '/stripped/path',
    })
  })

  it('caches 404 responses', async () => {
    const { handler, agent } = createTestApp('not-found', async (_req, res) => {
      res.statusCode = 404
      res.end('missing')
    })
    await assertResponse(agent.get('/missing'), 'miss')
    await assertResponse(agent.get('/missing'), 'hit')
    expect(handler).toHaveBeenCalledTimes(1)
    assertCacheState()
  })

  it('handles write errors correctly', async () => {
    const onError = vi.fn()
    const { handler, agent } = createTestApp('error', async (_req, res) => {
      res.once('error', onError)
      res.write('1-', () => res.write('2-'))
      res.end('3')
    })
    await assertResponse(agent.get('/error'), 'miss')
    await assertResponse(agent.get('/error'), 'repeat')
    expect(handler).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'write after end',
        code: 'ERR_STREAM_WRITE_AFTER_END',
      }),
    )
    assertCacheState()
  })

  it('skips stale cache entries', async () => {
    const { handler, agent } = createTestApp('version-check', async (_req, res) => {
      res.statusCode = 200
      res.setHeader('test-header', 'fresh-value')
      res.end('fresh-response')
    })

    const encodedPath = Buffer.from('/fresh').toString('base64url')
    const key = `.gatsby-adapter-firebase/version-check/${encodedPath}.bin`
    const staleHeader = JSON.stringify({
      status: 200,
      headers: [
        { name: 'cache-control', value: 'public, max-age=0, must-revalidate' },
        { name: 'content-length', value: 5 },
      ],
      version: 'old-version',
    })

    cache.set(key, {
      file: Buffer.concat([Buffer.from(`${staleHeader}\n`, 'utf8'), Buffer.from('stale', 'utf8')]),
      metadata: { metadata: { headerLength: staleHeader.length + 1 } },
    })

    await assertResponse(agent.get('/fresh'), 'miss')
    await assertResponse(agent.get('/fresh'), 'hit')
    expect(handler).toHaveBeenCalledTimes(1)
    assertCacheState()
  })
})
