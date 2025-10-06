import type { HttpsOptions } from 'firebase-functions/v2/https'

export interface HeaderKV {
  key: string
  value: string
}

export interface AdapterOptions {
  hostingTarget?: string
  region?: string
  functionsOutDir?: string
  functionsCodebase?: string
  functionsRuntime?: string
  functionsConfig?: HttpsOptions
  functionsConfigOverride?: Record<string, HttpsOptions>
  excludeDatastoreFromEngineFunction?: boolean
}

export type HostingRedirect = {
  source: string
  destination: string
  type?: number
}

export type HostingHeader = {
  source: string
  headers: HeaderKV[]
}

export type HostingFunctionRewrite = {
  source: string
  function: {
    functionId: string
    region?: string
    pinTag?: boolean
  }
}

export type HostingDestinationRewrite = {
  source: string
  destination: string
}

export type HostingRewrite = HostingFunctionRewrite | HostingDestinationRewrite

export type HostingConfig = {
  target: string
  public?: string
  ignore?: string[]
  redirects?: HostingRedirect[]
  rewrites?: HostingRewrite[]
  headers?: HostingHeader[]
  [k: string]: unknown
}

export type FunctionsEntry = {
  codebase: string
  source: string
  runtime?: string
  [k: string]: unknown
}

export type FirebaseJson = {
  hosting?: HostingConfig | HostingConfig[]
  functions?: FunctionsEntry | FunctionsEntry[]
  [k: string]: unknown
}

export type FunctionExport = {
  originalId: string
  deployedId: string
  relativeEntry: string
}

export type PreparedFunctions = {
  exports: FunctionExport[]
  copiedFiles: Set<string>
}

export type PackageJson = {
  name: string
  version: string
  [k: string]: unknown
}
