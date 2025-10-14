import type { FunctionConfig, FunctionMetadata } from './runtime/types.js'

export interface HeaderKV {
  key: string
  value: string
}

export type FirebaseHostingRule<T extends Record<string, unknown>> =
  | (T & { regex: string; source?: never })
  | (T & { source: string; regex?: never })

export type FirebaseHostingRedirect = FirebaseHostingRule<{
  destination: string
  type?: 301 | 302
}>

export type FirebaseHostingHeader = FirebaseHostingRule<{
  headers: HeaderKV[]
}>

export type FirebaseHostingFunctionRewrite = FirebaseHostingRule<{
  function: {
    functionId: string
    region?: string
    pinTag?: boolean
  }
}>

export type FirebaseHostingDestRewrite = FirebaseHostingRule<{
  destination: string
}>

export type FirebaseHostingRewrite = FirebaseHostingFunctionRewrite | FirebaseHostingDestRewrite

export interface FirebaseHostingJson {
  target: string
  public?: string
  ignore?: string[]
  redirects?: FirebaseHostingRedirect[]
  rewrites?: FirebaseHostingRewrite[]
  headers?: FirebaseHostingHeader[]
  [k: string]: unknown
}

export interface FirebaseFunctionsJson {
  codebase: string
  source: string
  runtime?: string
  ignore?: string[]
  [k: string]: unknown
}

export interface FirebaseJson {
  hosting?: FirebaseHostingJson | FirebaseHostingJson[]
  functions?: FirebaseFunctionsJson | FirebaseFunctionsJson[]
  [k: string]: unknown
}

export type FunctionDeploymentKind = keyof FunctionDeploymentSet

export interface FunctionDeployment {
  id: string
  deployId: string
  kind: FunctionDeploymentKind
  entryPath: string
  modulePath: string
  files: string[]
  config: FunctionConfig
  meta: FunctionMetadata
}

export interface FunctionDeploymentSet {
  default: FunctionDeployment
  cached?: FunctionDeployment
}

export type FunctionsRuntime = typeof import('./runtime.js')
export type FunctionsRuntimeExport = keyof FunctionsRuntime

export interface PackageJson {
  name: string
  version: string
  [k: string]: unknown
}
