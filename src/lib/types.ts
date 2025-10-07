import type { FunctionConfig } from './runtime/types.js'

export interface HeaderKV {
  key: string
  value: string
}

export interface AdapterOptions {
  hostingTarget?: string
  functionsOutDir?: string
  functionsCodebase?: string
  functionsRuntime?: string
  functionsConfig?: FunctionConfig
  functionsConfigOverride?: Record<string, FunctionConfig>
  excludeDatastoreFromEngineFunction?: boolean
}

export type FirebaseHostingRedirect = {
  source: string
  destination: string
  type?: number
}

export type FirebaseHostingHeader = {
  source: string
  headers: HeaderKV[]
}

export type FirebaseHostingFunctionRewrite = {
  source: string
  function: {
    functionId: string
    region?: string
    pinTag?: boolean
  }
}

export type FirebaseHostingDestRewrite = {
  source: string
  destination: string
}

export type FirebaseHostingRewrite = FirebaseHostingFunctionRewrite | FirebaseHostingDestRewrite

export type FirebaseHostingJson = {
  target: string
  public?: string
  ignore?: string[]
  redirects?: FirebaseHostingRedirect[]
  rewrites?: FirebaseHostingRewrite[]
  headers?: FirebaseHostingHeader[]
  [k: string]: unknown
}

export type FirebaseFunctionsJson = {
  codebase: string
  source: string
  runtime?: string
  [k: string]: unknown
}

export type FirebaseJson = {
  hosting?: FirebaseHostingJson | FirebaseHostingJson[]
  functions?: FirebaseFunctionsJson | FirebaseFunctionsJson[]
  [k: string]: unknown
}

export type FunctionVariant = keyof FunctionVariants

export type FunctionEntry = {
  id: string
  deployId: string
  entryFile: string
  variant: FunctionVariant
  config?: FunctionConfig
}

export type FunctionVariants = {
  default: FunctionEntry
  cached?: FunctionEntry
}

export type FunctionsMap = Map<string, FunctionVariants>
export type FunctionsWorkspace = {
  dir: string
  files: string[]
  exports: FunctionEntry[]
}

export type FunctionsRuntime = typeof import('./runtime.js')
export type FunctionsRuntimeExport = keyof FunctionsRuntime

export type PackageJson = {
  name: string
  version: string
  [k: string]: unknown
}
