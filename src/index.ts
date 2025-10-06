import path from 'node:path'
import type { AdapterInit } from 'gatsby'
import type { AdapterOptions, HostingEntry, FunctionsEntry } from './lib/types.js'
import { prepareFunctionsWorkspace } from './lib/functions-builder.js'
import { transformRoutes } from './lib/routes-transform.js'
import { mergeFirebaseJson } from './lib/firebase-merge.js'
import { readPackageJson, relativeToPosix } from './lib/utils.js'

const createAdapter: AdapterInit<AdapterOptions> = (adapterOptions = {}) => {
  const hostingTarget = adapterOptions.hostingTarget ?? 'gatsby'
  const functionsConfig = adapterOptions.functionsConfig
  const functionsConfigOverride = adapterOptions.functionsConfigOverride ?? {}
  const functionsOutDirRel = adapterOptions.functionsOutDir ?? '.firebase/functions'
  const functionsCodebase = adapterOptions.functionsCodebase ?? 'gatsby'
  const functionsRuntime = adapterOptions.functionsRuntime ?? 'nodejs20'

  return {
    name: 'gatsby-adapter-firebase',

    async adapt({ routesManifest, functionsManifest, pathPrefix, reporter }) {
      const projectRoot = process.cwd()
      const functionsOutDir = path.resolve(projectRoot, functionsOutDirRel)
      const firebaseJsonFile = path.join(projectRoot, 'firebase.json')

      const fnResult = await prepareFunctionsWorkspace({
        functions: functionsManifest ?? [],
        outDir: functionsOutDir,
        projectRoot,
        reporter,
        runtime: functionsRuntime,
        functionsConfig,
        functionsConfigOverride,
      })

      const hostingResult = transformRoutes({
        routes: routesManifest ?? [],
        pathPrefix,
        reporter,
        functionIdMap: fnResult.idMap,
        functionsConfig,
        functionsConfigOverride,
      })

      const functionsEntry: FunctionsEntry = fnResult.artifacts && {
        codebase: functionsCodebase,
        source: relativeToPosix(projectRoot, functionsOutDir) || '.',
        runtime: functionsRuntime,
      }

      const hostingEntry: HostingEntry = {
        target: hostingTarget,
        public: 'public',
        redirects: hostingResult.redirects,
        rewrites: hostingResult.rewrites,
        headers: hostingResult.headers,
      }

      const configResult = await mergeFirebaseJson(firebaseJsonFile, {
        hostingEntry,
        functionsEntry,
      })

      const functionExports = fnResult.artifacts?.exports
      const infoParts = [
        `target=${hostingTarget}`,
        `redirects=${hostingResult.redirects.length}`,
        `rewrites=${hostingResult.rewrites.length}`,
        `headers=${hostingResult.headers.length}`,
        `functions=${functionExports?.length ?? 0}`,
      ]
      reporter.info(
        `[gatsby-adapter-firebase] firebase.json ${
          configResult.wrote ? 'updated' : 'unchanged'
        } · ${infoParts.join(', ')} (use --verbose for breakdown)`,
      )

      if (functionExports?.length) {
        const mapped = functionExports.map((fn) => `${fn.relativeEntry} → ${fn.deployedId}`)
        reporter.verbose(
          `[gatsby-adapter-firebase] Functions codebase: ${[
            `${functionsCodebase} → ${functionsOutDir}`,
          ]
            .concat(mapped)
            .join('\n · ')}`,
        )
      } else {
        reporter.verbose(
          '[gatsby-adapter-firebase] no Gatsby functions detected; hosting static assets only',
        )
      }
    },

    config({ reporter }) {
      reporter.verbose(`[gatsby-adapter-firebase] version: ${readPackageJson().version}`)

      const deployURL = process.env['DEPLOY_URL']
      let excludeDatastoreFromEngineFunction =
        adapterOptions?.excludeDatastoreFromEngineFunction ?? false
      if (excludeDatastoreFromEngineFunction && !deployURL) {
        reporter.warn(
          '[gatsby-adapter-firebase] excludeDatastoreFromEngineFunction=true but DEPLOY_URL is not set; disabling option.',
        )
        excludeDatastoreFromEngineFunction = false
      }

      return {
        supports: {
          pathPrefix: true,
          trailingSlash: ['always', 'never', 'ignore'],
        },
        pluginsToDisable: ['gatsby-plugin-netlify-cache', 'gatsby-plugin-netlify'],
        functionsPlatform: 'linux',
        // functionsPlatform: 'darwin', // used for local testing
        functionsArch: 'x64',
        excludeDatastoreFromEngineFunction,
        deployURL,
      }
    },
  }
}

export default createAdapter
export type { AdapterOptions }
