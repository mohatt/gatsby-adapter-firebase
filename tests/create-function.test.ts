import express from 'express'
import request from 'supertest'
import { createFunction } from '../src/lib/runtime.js'
import type { FunctionHandler } from '../src/lib/runtime/types.js'

const createTestApp = (id: string, handler: FunctionHandler) => {
  const mockHandler = vi.fn(handler)
  const mockFunction = vi.fn(
    createFunction(mockHandler, {
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

describe('createFunction()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prepares req before passing to handler', async () => {
    const { handler, fn, agent } = createTestApp('test', async (_req, res) => {
      res.statusCode = 200
      res.end('payload')
    })
    await agent
      .get('/run?foo=bar#test')
      .set('Cookie', 'name=test; theme=dark')
      .expect(200)
      .expect((res) => {
        expect(res.text).toBe('payload')
      })
    const [handlerReq] = handler.mock.lastCall ?? []
    const [fnReq] = fn.mock.lastCall ?? []
    expect(handlerReq.url).toBe(fnReq.url)
    expect(handlerReq.originalUrl).toBe(fnReq.originalUrl)
    expect(handlerReq.cookies).toMatchObject({ name: 'test', theme: 'dark' })
    expect(fnReq.cookies).toBeUndefined()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('strips query strings for ssr-engine', async () => {
    const { handler, agent } = createTestApp('ssr-engine', async (_req, res) => {
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
})
