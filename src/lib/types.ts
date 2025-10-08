import type { FunctionConfig } from './runtime/types.js'

export interface HeaderKV {
  key: string
  value: string
}

export interface FirebaseHostingRedirect {
  source: string
  destination: string
  type?: number
}

export interface FirebaseHostingHeader {
  source: string
  headers: HeaderKV[]
}

export interface FirebaseHostingFunctionRewrite {
  source: string
  function: {
    functionId: string
    region?: string
    pinTag?: boolean
  }
}

export interface FirebaseHostingDestRewrite {
  source: string
  destination: string
}

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
  [k: string]: unknown
}

export interface FirebaseJson {
  hosting?: FirebaseHostingJson | FirebaseHostingJson[]
  functions?: FirebaseFunctionsJson | FirebaseFunctionsJson[]
  [k: string]: unknown
}

export type FunctionVariant = keyof FunctionVariants

export interface FunctionEntry {
  id: string
  deployId: string
  entryFile: string
  variant: FunctionVariant
  config?: FunctionConfig
}

export interface FunctionVariants {
  default: FunctionEntry
  cached?: FunctionEntry
}

export interface FunctionsWorkspace {
  dir: string
  files: string[]
  exports: FunctionEntry[]
}

export type FunctionsRuntime = typeof import('./runtime.js')
export type FunctionsRuntimeExport = keyof FunctionsRuntime

export interface PackageJson {
  name: string
  version: string
  [k: string]: unknown
}
