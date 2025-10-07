import { onRequest, HttpsFunction } from 'firebase-functions/v2/https'
import { createCachedHandler } from './cached-handler.js'
import type { FunctionModule, FunctionHandler, FunctionConfig } from './types.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]'

const mergeHandlerOptions = <T extends FunctionConfig | undefined>(
  ...sources: Array<T | undefined>
): T | undefined => {
  const filtered = sources.filter((candidate): candidate is T => isPlainObject(candidate))
  if (filtered.length === 0) return undefined
  return Object.assign({}, ...filtered)
}

const resolveFunctionExports = (module: FunctionModule, id: string) => {
  let handler: FunctionHandler
  let config: FunctionConfig | undefined
  if ('default' in module) {
    // export default () => {}
    // export const options = {...}
    handler = module.default
    config = module.config
  } else {
    // module.exports = () => {}
    handler = module
  }

  if (typeof handler !== 'function') {
    throw new Error(`[gatsby-adapter-firebase] Expected function export for ${id} to be callable`)
  }

  return [handler, config] as const
}

export const createHttpsFunction = (
  module: FunctionModule,
  id: string,
  baseConfig?: FunctionConfig,
): HttpsFunction => {
  const [handler, configExport] = resolveFunctionExports(module, id)
  const config = mergeHandlerOptions(baseConfig, configExport)
  if (config) {
    return onRequest(config, handler)
  }
  return onRequest(handler)
}

export const createCachedHttpsFunction = (
  module: FunctionModule,
  id: string,
  baseConfig?: FunctionConfig,
): HttpsFunction => {
  const [handler, configExport] = resolveFunctionExports(module, id)
  const cachedHandler = createCachedHandler(handler, id)
  const options = mergeHandlerOptions(baseConfig, configExport)
  if (options) {
    return onRequest(options, cachedHandler)
  }
  return onRequest(cachedHandler)
}
