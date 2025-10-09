import { beforeEach, describe, expect, it, vi } from 'vitest'
import _ from 'lodash'
import express from 'express'
import request from 'supertest'
import { createCachedHandler, CachedPayload } from '../src/lib/runtime/cached-handler.js'
import type { FunctionHandler } from '../src/lib/runtime.js'

const cache = new Map<string, CachedPayload>()

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({
    bucket: () => ({
      file: (name: string) => ({
        async exists(): Promise<[boolean]> {
          return [cache.has(name)]
        },
        async download(): Promise<[Buffer]> {
          const payload = cache.get(name)
          if (!payload) {
            throw new Error(`No stored payload for ${name}`)
          }
          return [Buffer.from(JSON.stringify(payload), 'utf8')]
        },
        async save(contents: string | Buffer) {
          const normalized = typeof contents === 'string' ? contents : contents.toString('utf8')
          cache.set(name, JSON.parse(normalized))
        },
      }),
    }),
  })),
}))

const createTestApp = (id: string, handler: FunctionHandler) => {
  const mockHandler = vi.fn(handler)
  const cachedHandler = createCachedHandler(mockHandler, id)
  const server = express().disable('x-powered-by')
  server.all('*', (req, res) => {
    Promise.resolve(cachedHandler(req as any, res)).catch((error) => {
      res.statusCode = 500
      res.end(error instanceof Error ? error.message : String(error))
    })
  })
  const agent = request(server)
  return [mockHandler, agent] as const
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

const assertCacheState = () => expect(cache).toMatchSnapshot('cache')

describe('createCachedHandler()', { timeout: 60_000 }, () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  it('serves streaming responses correctly', async () => {
    const [handler, agent] = createTestApp('function-id', async (_req, res) => {
      res.statusCode = 200
      res.setHeader('Set-Cookie', ['a=1', 'b=2'])
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
    const [handler, agent] = createTestApp('non-cacheable', async (_req, res) => {
      res.statusCode = 500
      res.end('error')
    })
    await assertResponse(agent.get('/error'), 'miss')
    await assertResponse(agent.get('/error'), 'repeat')
    expect(handler).toHaveBeenCalledTimes(2)
    assertCacheState()
  })

  it('serves cached GET bodies to HEAD requests', async () => {
    const [handler, agent] = createTestApp('head', async (_req, res) => {
      res.statusCode = 200
      res.end('payload')
    })
    await assertResponse(agent.get('/head'), 'get')
    await assertResponse(agent.head('/head'), 'head')
    expect(handler).toHaveBeenCalledTimes(1)
    assertCacheState()
  })

  it('caches 404 responses', async () => {
    const [handler, agent] = createTestApp('not-found', async (_req, res) => {
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
    const [handler, agent] = createTestApp('error', async (_req, res) => {
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
})
