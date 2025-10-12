import { onRequest, HttpsFunction } from 'firebase-functions/v2/https'
import { createCachedHandler } from './cached-handler.js'
import type { FunctionModule, FunctionHandler, FunctionConfig, FunctionMetadata } from './types.js'

const resolveHandlerConfig = <T extends FunctionConfig | undefined>(
  meta: FunctionMetadata,
  ...configs: Array<T | undefined>
): T => {
  const config = Object.assign({}, ...configs) as T
  config.labels = {
    ...config.labels,
    generator: meta.generator,
  }
  return config
}

const resolveFunctionExports = (module: FunctionModule, meta: FunctionMetadata) => {
  let handler: FunctionHandler
  let config: FunctionConfig | undefined

  if ('default' in module) {
    // export default () => {}
    // export const config = { firebase: {...} }
    handler = module.default
    config = module.config?.firebase
  } else {
    // module.exports = () => {}
    handler = module
  }

  if (typeof handler !== 'function') {
    throw new Error(
      `[gatsby-adapter-firebase] Expected function export for ${meta.id} to be callable`,
    )
  }

  return [handler, config] as const
}

export const createHttpsFunction = (
  module: FunctionModule,
  meta: FunctionMetadata,
  baseConfig?: FunctionConfig,
): HttpsFunction => {
  const [handler, configExport] = resolveFunctionExports(module, meta)
  const config = resolveHandlerConfig(meta, baseConfig, configExport)
  return onRequest(config, handler)
}

export const createCachedHttpsFunction = (
  module: FunctionModule,
  meta: FunctionMetadata,
  baseConfig?: FunctionConfig,
): HttpsFunction => {
  const [handler, configExport] = resolveFunctionExports(module, meta)
  const config = resolveHandlerConfig(meta, baseConfig, configExport)
  const cachedHandler = createCachedHandler(handler, meta)
  return onRequest(config, cachedHandler)
}
