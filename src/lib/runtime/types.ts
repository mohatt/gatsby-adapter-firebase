import type { onRequest, HttpsOptions } from 'firebase-functions/v2/https'

export type FunctionHandler = Parameters<typeof onRequest>[0]
export type Request = Parameters<FunctionHandler>[0]
export type Response = Parameters<FunctionHandler>[1]

export type FunctionConfig = HttpsOptions
export type FunctionModule<
  THandler extends FunctionHandler = FunctionHandler,
  TConfig extends FunctionConfig = FunctionConfig,
> = THandler | { default: THandler; config?: TConfig }
