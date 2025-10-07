import path from 'node:path'
import type { AdapterInit } from 'gatsby'
import type { AdapterOptions, FirebaseHostingJson, FirebaseFunctionsJson } from './lib/types.js'
import { AdaptorReporter } from './lib/reporter.js'
import { buildFunctions } from './lib/build-functions.js'
import { buildHosting } from './lib/build-hosting.js'
import { buildConfig } from './lib/build-config.js'
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

      const [functionsResult, functionsErr] = await reporter
        .activity('buildFunctions', 'Building functions workspace')
        .run(async (setStatus) => {
          const result = await buildFunctions({
            routesManifest,
            functionsManifest,
            outDir: functionsOutDir,
            projectRoot,
            reporter,
            runtime: functionsRuntime,
            functionsConfig,
            functionsConfigOverride,
          })

          const fnExports = result.workspace?.exports
          if (fnExports?.length) {
            const infoParts = [
              `codebase=${functionsCodebase}`,
              `functions=${fnExports.length} (use --verbose for breakdown)`,
            ]
            setStatus(infoParts.join(', '))

            reporter.verbose(
              `Functions codebase: ${[`${functionsCodebase} → ${functionsOutDir}`]
                .concat(fnExports.map((fn) => `${fn.entryFile} → ${fn.deployId}`))
                .join('\n - ')}`,
            )
          } else {
            setStatus('skipped')
          }

          return result
        })
      if (functionsErr) return

      const [hostingResult, hostingErr] = await reporter
        .activity('buildHosting', 'Building hosting config')
        .run((setStatus) => {
          const result = buildHosting({
            routesManifest,
            pathPrefix,
            reporter,
            functionsMap: functionsResult.functionsMap,
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

      await reporter.activity('buildConfig', 'Building firebase.json').run(async (setStatus) => {
        const functionsEntry: FirebaseFunctionsJson = functionsResult.workspace && {
          codebase: functionsCodebase,
          source: relativeToPosix(projectRoot, functionsOutDir) || '.',
          runtime: functionsRuntime,
        }

        const hostingEntry: FirebaseHostingJson = {
          target: hostingTarget,
          public: 'public',
          redirects: hostingResult.redirects,
          rewrites: hostingResult.rewrites,
          headers: hostingResult.headers,
        }

        const result = await buildConfig(firebaseJsonFile, {
          hosting: hostingEntry,
          functions: functionsEntry,
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
