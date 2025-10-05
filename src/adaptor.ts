import path from 'node:path'
import fs from 'node:fs/promises'
import type { AdapterInit, IFunctionDefinition, RoutesManifest, FunctionsManifest, IStaticRoute, IFunctionRoute, IRedirectRoute } from 'gatsby'

type HeaderKV = { key: string; value: string }

type AdapterOptions = {
  target?: string // hosting target name in .firebaserc (default: 'gatsby')
  region?: string // functions region (default: 'us-central1')
  publicDir?: string // Gatsby's public dir (default: 'public')
  functionsOutDir?: string // where to emit functions entry (default: '.firebase/functions')
  functionsCodebase?: string // functions codebase name (default: 'gatsby')
  excludeDatastoreFromEngineFunction?: boolean
}

type HostingRule = {
  source: string
  destination?: string
  type?: number
  function?: { functionId: string; region?: string; pinTag?: boolean }
}

type HeaderRule = { source: string; headers: HeaderKV[] }

type HostingBlock = {
  target: string
  public?: string
  ignore?: string[]
  redirects?: HostingRule[]
  rewrites?: HostingRule[]
  headers?: HeaderRule[]
  [k: string]: unknown
}

type FunctionsEntry = { source: string; codebase: string; [k: string]: unknown }

type FirebaseJson = {
  hosting?: HostingBlock | HostingBlock[]
  functions?: FunctionsEntry | FunctionsEntry[]
  [k: string]: unknown
}

// -------------------------------
// utils
// -------------------------------

const toArray = <T>(v: T | T[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])

const readJsonIfExists = async <T>(file: string): Promise<T | undefined> => {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

const writeIfChanged = async (file: string, contents: string) => {
  const prev = await fs.readFile(file, 'utf8').catch(() => '')
  if (prev !== contents) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, contents)
    return true
  }
  return false
}

// -------------------------------
// 1) Convert Gatsby manifests → Firebase rules
// -------------------------------

const routesToRedirectsHeaders = (routes: RoutesManifest) => {
  const redirects: HostingRule[] = []
  const headers: HeaderRule[] = []

  for (const r of routes) {
    if (r.type === 'redirect') {
      redirects.push({
        source: r.path,
        destination: r.toPath,
        type: r.status,
      })
    } else if (r.type === 'static' && r.headers?.length) {
      headers.push({
        source: r.path,
        headers: r.headers.map((h) => ({ key: h.key, value: h.value })),
      })
    }
  }

  return { redirects, headers }
}

const routesToFunctionRewrites = (routes: RoutesManifest, region: string) => {
  const rewrites: HostingRule[] = []
  for (const r of routes) {
    if (r.type === 'function') {
      rewrites.push({
        source: r.path,
        function: { functionId: r.functionId, region, pinTag: true },
      })
    }
  }
  return rewrites
}

// -------------------------------
// 2) Merge into firebase.json (target-only, idempotent)
// -------------------------------

const mergeFirebaseJson = async (opts: {
  filePath: string
  hostingTarget: string
  functionsCodebase: string
  functionsSource: string
  publicDir: string
  redirects: HostingRule[]
  rewrites: HostingRule[]
  headers: HeaderRule[]
}) => {
  const {
    filePath,
    hostingTarget,
    functionsCodebase,
    functionsSource,
    publicDir,
    redirects,
    rewrites,
    headers,
  } = opts

  const existing = (await readJsonIfExists<FirebaseJson>(filePath)) ?? {}

  // ---- HOSTING (own the block with our target)
  const hostingArr = toArray<HostingBlock>(existing.hosting)
  let ours = hostingArr.find((h) => h.target === hostingTarget)

  if (!ours) {
    ours = {
      target: hostingTarget,
      public: publicDir,
      ignore: ['**/.*', '**/node_modules/**', 'firebase.json'],
      redirects: [],
      rewrites: [],
      headers: [],
    }
    hostingArr.push(ours)
  } else {
    if (!ours.public) ours.public = publicDir
    if (!ours.ignore) ours.ignore = ['**/.*', '**/node_modules/**', 'firebase.json']
  }

  // replace adapter-owned rule sets deterministically
  ours.redirects = redirects
  ours.rewrites = rewrites
  ours.headers = headers

  const hostingMerged = Array.isArray(existing.hosting) ? hostingArr : hostingArr[0]

  // ---- FUNCTIONS (own the entry with our codebase)
  const fnArr = toArray<FunctionsEntry>(existing.functions)
  let ourFn = fnArr.find((f) => f.codebase === functionsCodebase)
  if (!ourFn) {
    ourFn = { source: functionsSource, codebase: functionsCodebase }
    fnArr.push(ourFn)
  } else {
    ourFn.source = functionsSource
  }

  const functionsMerged = Array.isArray(existing.functions) ? fnArr : fnArr[0]

  const merged: FirebaseJson = {
    ...existing,
    hosting: hostingMerged,
    functions: functionsMerged,
  }

  const next = JSON.stringify(merged, null, 2)
  const wrote = await writeIfChanged(filePath, next)

  return { wrote, merged }
}

// -------------------------------
// 3) Functions wrapper (v2 HTTPS) generator
// -------------------------------

const emitFunctionsScaffold = async (outDir: string, fn: IFunctionDefinition) => {
  await fs.mkdir(outDir, { recursive: true })
  const localBundle = path.join(outDir, path.basename(fn.pathToEntryPoint))
  await fs.copyFile(fn.pathToEntryPoint, localBundle)

  const indexJs = [
    `import { onRequest } from 'firebase-functions/v2/https'`,
    `const handler = (await import('./${path.basename(localBundle)}')).default`,
    `export const ${fn.functionId} = onRequest((req, res) => handler(req, res))`,
    '',
  ].join('\n')

  await writeIfChanged(path.join(outDir, 'index.js'), indexJs)
  await writeIfChanged(
    path.join(outDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  )
}

// -------------------------------
// 4) The adapter
// -------------------------------

const firebase: AdapterInit<AdapterOptions> = (options = {}) => {
  const target = options.target ?? 'gatsby'
  const region = options.region ?? 'us-central1'
  const publicDir = options.publicDir ?? 'public'
  const functionsOutDir = options.functionsOutDir ?? '.firebase/functions'
  const functionsCodebase = options.functionsCodebase ?? 'gatsby'

  return {
    name: 'gatsby-adapter-firebase',

    async adapt({ routesManifest, functionsManifest, pathPrefix, trailingSlash, reporter }) {
      // console.log('[firebase] adapt()', routesManifest[0], {  pathPrefix, trailingSlash, functionsManifest })
      // await fs.writeFile('adapt-sample-args.json', JSON.stringify(arguments, null, 2))
      const root = process.cwd()
      const firebaseJsonPath = path.join(root, 'firebase.json')

      // functions: pick the first Gatsby SSR/DSG handler if present
      const fnEntry = functionsManifest?.[0]
      if (fnEntry) {
        await emitFunctionsScaffold(functionsOutDir, fnEntry)
      } else {
        reporter.info('[gatsby-adapter-firebase] No SSR/DSG functions found; static hosting only')
      }

      // translate routes → hosting rules
      const { redirects, headers } = routesToRedirectsHeaders(routesManifest)
      const rewrites = fnEntry ? routesToFunctionRewrites(routesManifest, region) : []

      // merge into firebase.json (target + codebase only)
      const { wrote } = await mergeFirebaseJson({
        filePath: firebaseJsonPath,
        hostingTarget: target,
        functionsCodebase,
        functionsSource: path.relative(root, functionsOutDir),
        publicDir,
        redirects,
        rewrites,
        headers,
      })

      reporter.info(
        `[gatsby-adapter-firebase] ${wrote ? 'updated' : 'unchanged'} firebase.json · target="${target}" · codebase="${functionsCodebase}"`,
      )
    },
    config({ reporter }) {
      reporter.verbose(
        `[gatsby-adapter-firebase] version: ${`unknown`}`
      )

      const deployURL = process.env['DEPLOY_URL']
      let excludeDatastoreFromEngineFunction =
        options?.excludeDatastoreFromEngineFunction ?? false
      if (excludeDatastoreFromEngineFunction && !deployURL) {
        reporter.warn(
          `[gatsby-adapter-firebase] excludeDatastoreFromEngineFunction is set to true but no DEPLOY_URL is set. Disabling excludeDatastoreFromEngineFunction.`
        )
        excludeDatastoreFromEngineFunction = false
      }

      return {
        supports: {
          pathPrefix: true,
          trailingSlash: [`always`, `never`, `ignore`],
        },
        pluginsToDisable: [
          `gatsby-plugin-netlify-cache`,
          `gatsby-plugin-netlify`,
        ],
        functionsPlatform: `linux`,
        functionsArch: `x64`,
        excludeDatastoreFromEngineFunction,
        deployURL,
      }
    }
  }
}

export default firebase
