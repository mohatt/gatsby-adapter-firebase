import path from 'node:path'
import type { AdapterInit } from 'gatsby'
import type { AdapterOptions, HostingEntry, FunctionsEntry } from './lib/types.js'
import { prepareFunctionsWorkspace } from './lib/functions-builder.js'
import { transformRoutes } from './lib/routes-transform.js'
import { mergeFirebaseJson } from './lib/firebase-merge.js'
import { readPackageJson, relativeToPosix } from './lib/utils.js'
import { AdaptorReporter } from './lib/reporter.js'

const createAdapter: AdapterInit<AdapterOptions> = (options = {}) => {
  const hostingTarget = options.hostingTarget ?? 'gatsby'
  const functionsConfig = options.functionsConfig
  const functionsConfigOverride = options.functionsConfigOverride ?? {}
  const functionsOutDirRel = options.functionsOutDir ?? '.firebase/functions'
  const functionsCodebase = options.functionsCodebase ?? 'gatsby'
  const functionsRuntime = options.functionsRuntime ?? 'nodejs20'

  return {
    name: 'gatsby-adapter-firebase',

    async adapt(args) {
      const { routesManifest, functionsManifest, pathPrefix, reporter: gatsbyReporter } = args
      const projectRoot = process.cwd()
      const functionsOutDir = path.resolve(projectRoot, functionsOutDirRel)
      const firebaseJsonFile = path.join(projectRoot, 'firebase.json')
      const reporter = new AdaptorReporter(gatsbyReporter)

      const [fnResult, fnErr] = await reporter
        .activity('buildFunctions', 'Building functions workspace')
        .run(async (setStatus) => {
          const result = await prepareFunctionsWorkspace({
            functions: functionsManifest ?? [],
            outDir: functionsOutDir,
            projectRoot,
            reporter,
            runtime: functionsRuntime,
            functionsConfig,
            functionsConfigOverride,
          })

          const functionExports = result.artifacts?.exports
          if (functionExports?.length) {
            const infoParts = [
              `codebase=${functionsCodebase}`,
              `functions=${functionExports.length} (use --verbose for breakdown)`,
            ]
            setStatus(infoParts.join(', '))

            reporter.verbose(
              `Functions codebase: ${[`${functionsCodebase} → ${functionsOutDir}`]
                .concat(functionExports.map((fn) => `${fn.relativeEntry} → ${fn.deployedId}`))
                .join('\n - ')}`,
            )
          } else {
            setStatus('skipped')
          }

          return result
        })
      if (fnErr) return

      const [hostingResult, hostingErr] = await reporter
        .activity('transformRoutes', 'Building hosting config')
        .run((setStatus) => {
          const result = transformRoutes({
            routes: routesManifest ?? [],
            pathPrefix,
            reporter,
            functionIdMap: fnResult.idMap,
            functionsConfig,
            functionsConfigOverride,
          })

          const infoParts = [
            `target=${hostingTarget}`,
            `redirects=${result.redirects.length}`,
            `rewrites=${result.rewrites.length}`,
            `headers=${result.headers.length}`,
          ]
          setStatus(infoParts.join(', '))

          return result
        })
      if (hostingErr) return

      await reporter.activity('writeConfig', 'Building firebase.json').run(async (setStatus) => {
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

        const result = await mergeFirebaseJson(firebaseJsonFile, {
          hostingEntry,
          functionsEntry,
        })

        setStatus(
          result.wrote > 0 ? `updated (${(result.wrote / 1024).toFixed(2)} KB)` : 'unchanged',
        )

        return result
      })
    },

    config({ reporter }) {
      reporter.verbose(`[gatsby-adapter-firebase] version: ${readPackageJson().version}`)

      const deployURL = process.env['DEPLOY_URL']
      let excludeDatastoreFromEngineFunction = options?.excludeDatastoreFromEngineFunction ?? false
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
