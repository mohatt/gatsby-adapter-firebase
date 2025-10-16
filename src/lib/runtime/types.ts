import type { GatsbyFunctionRequest, GatsbyFunctionResponse, GatsbyFunctionConfig } from 'gatsby'
import type { onRequest, HttpsOptions } from 'firebase-functions/v2/https'

export type FunctionHandler = Parameters<typeof onRequest>[0]
export type Request = Parameters<FunctionHandler>[0]
export type Response = Parameters<FunctionHandler>[1]

export type GatsbyFirebaseFunctionRequest = Request & GatsbyFunctionRequest
export type GatsbyFirebaseFunctionResponse = Response & GatsbyFunctionResponse

export type FunctionConfig = HttpsOptions
export interface GatsbyFirebaseFunctionConfig extends GatsbyFunctionConfig {
  firebase?: FunctionConfig
}

export interface FunctionMetadata {
  id: string
  name: string
  version: string
  generator: string
  storageBucket?: string
}

export type FunctionModule =
  | FunctionHandler
  | { default: FunctionHandler; config?: GatsbyFirebaseFunctionConfig }
