import { onRequest, HttpsFunction } from 'firebase-functions/v2/https'
import { createDefaultHandler } from './default-handler.js'
import { createCachedHandler } from './cached-handler.js'
import type { FunctionModule, FunctionHandler, FunctionConfig, FunctionMetadata } from './types.js'

const resolveFunctionExports = (
  module: FunctionModule,
  meta: FunctionMetadata,
  baseConfig?: FunctionConfig,
) => {
  let gatsbyHandler: FunctionHandler
  let functionConfig: FunctionConfig | undefined

  if ('default' in module) {
    // export default () => {}
    // export const config = { firebase: {...} }
    gatsbyHandler = module.default
    functionConfig = module.config?.firebase
  } else {
    // module.exports = () => {}
    gatsbyHandler = module
  }

  if (typeof gatsbyHandler !== 'function') {
    throw new TypeError(
      `[gatsby-adapter-firebase] Expected function export for ${meta.id} to be callable`,
    )
  }

  const config: FunctionConfig = {
    invoker: 'public',
    ...baseConfig,
    ...functionConfig,
    labels: {
      ...baseConfig?.labels,
      ...functionConfig?.labels,
      generator: meta.generator,
    },
  }

  return [gatsbyHandler, config] as const
}

export const createHttpsFunction = (
  module: FunctionModule,
  meta: FunctionMetadata,
  baseConfig?: FunctionConfig,
): HttpsFunction => {
  const [handler, config] = resolveFunctionExports(module, meta, baseConfig)
  return onRequest(config, createDefaultHandler(handler, meta))
}

export const createCachedHttpsFunction = (
  module: FunctionModule,
  meta: FunctionMetadata,
  baseConfig?: FunctionConfig,
): HttpsFunction => {
  const [handler, config] = resolveFunctionExports(module, meta, baseConfig)
  return onRequest(config, createCachedHandler(handler, meta))
}
