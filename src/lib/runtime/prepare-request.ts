import { parse as parseCookies } from 'cookie'
import type { Request } from './types.js'

const normalizePath = (value: string | undefined) => {
  if (!value || value === '/') return '/'
  // strip query and hash
  const index = value.search(/[?#]/)
  const normalized = index === -1 ? value : value.slice(0, index)
  // ensure one leading slash
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export const prepareRequest = (originalReq: Request, resetQuery?: boolean) => {
  const req = Object.create(originalReq) as Request

  // Gatsby includes cookie middleware
  const cookies = req.headers.cookie
  if (cookies) {
    req.cookies = parseCookies(cookies)
  }

  if (!resetQuery) {
    return req
  }

  // strip query and hash from urls
  if (typeof req.url === 'string') req.url = normalizePath(req.url)
  if (typeof req.originalUrl === 'string') req.originalUrl = normalizePath(req.originalUrl)

  // reset `query` which was set by `req.path` getter
  req.query = Object.create(null)
  // trigger getter for reparse
  void req.path

  return req
}
