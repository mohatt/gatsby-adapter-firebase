import type { FunctionHandler, FunctionMetadata } from './types.js'
import { prepareRequest } from './utils.js'

export const createDefaultHandler = (
  handler: FunctionHandler,
  meta: Pick<FunctionMetadata, 'id'>,
): FunctionHandler => {
  return async (originalReq, res) => {
    /**
     * Gatsby SSR matches page routes using req.url.
     * If query params are added, we end up with a req.url like /foo?q=bar.
     * Gatsby doesn't match that to /foo route, so we end up with a 404.
     * Here, we reset query params from only the SSR function.
     */
    const resetQuery = meta.id === 'ssr-engine'

    const req = prepareRequest(originalReq, resetQuery)

    await handler(req, res)
  }
}
