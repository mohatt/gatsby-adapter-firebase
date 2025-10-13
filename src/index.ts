import path from 'node:path'
import type { AdapterInit } from 'gatsby'
import { AdapterOptions, ValidatedAdapterOptions, validateOptions } from './options.js'
import { AdaptorReporter } from './lib/reporter.js'
import { buildFunctions } from './lib/build-functions.js'
import { buildHosting } from './lib/build-hosting.js'
import { buildConfig } from './lib/build-config.js'
import { readPackageJson } from './lib/utils.js'

const createAdapter: AdapterInit<AdapterOptions> = (userOptions) => {
  let reporter: AdaptorReporter | undefined
  let options: ValidatedAdapterOptions | undefined

  return {
    name: 'gatsby-adapter-firebase',

    async adapt(args) {
      if (!reporter || !options) {
        throw new Error('[gatsby-adapter-firebase] Expected adaptor state to be initialized')
      }

      const projectRoot = process.cwd()
      const { routesManifest, functionsManifest, pathPrefix } = args

      const functionsResult = await reporter
        .activity('buildFunctions', 'Building functions workspace')
        .run(async (setStatus) => {
          const result = await buildFunctions({
            projectRoot,
            routesManifest,
            functionsManifest,
            reporter,
            options,
          })

          if (!functionsManifest.length || !result) {
            setStatus('skipped')
            return result
          }

          const { workspace, config } = result
          const infoParts = [
            `codebase=${config.codebase}`,
            `files=${workspace.files.size}`,
            `functions=${workspace.deployments.length} (use --verbose for breakdown)`,
          ]
          setStatus(infoParts.join(', '))

          reporter.info(
            `Bundled functions → ${path.relative(projectRoot, workspace.dir)}`,
            workspace.deployments.map(
              (fn) => `${path.relative(workspace.dir, fn.entryPath)} → ${fn.deployId}`,
            ),
          )

          return result
        })

      const hostingResult = await reporter
        .activity('buildHosting', 'Building hosting config')
        .run((setStatus) => {
          const result = buildHosting({
            routesManifest,
            pathPrefix,
            reporter,
            options,
            functionsMap: functionsResult?.functionsMap,
          })

          const { target, redirects, headers, rewrites } = result.config
          const infoParts = [
            `target=${target}`,
            `redirects=${redirects.length}`,
            `rewrites=${rewrites.length}`,
            `headers=${headers.length}`,
          ]
          setStatus(infoParts.join(', '))

          return result
        })

      await reporter.activity('buildConfig', 'Building firebase.json').run(async (setStatus) => {
        const firebaseJsonFile = path.join(projectRoot, 'firebase.json')
        const result = await buildConfig(firebaseJsonFile, {
          hosting: hostingResult.config,
          functions: functionsResult?.config,
        })

        setStatus(
          result.wrote > 0 ? `updated (${(result.wrote / 1024).toFixed(2)} KB)` : 'unchanged',
        )

        return result
      })
    },

    async config({ reporter: gatsbyReporter }) {
      reporter = new AdaptorReporter(gatsbyReporter)
      const result = await validateOptions(userOptions ?? {})
      if ('errors' in result) reporter.panic('options', `Invalid options provided`, result.errors)
      if (result.warnings) reporter.warn('Unsupported options provided', result.warnings)
      reporter.verbose(`version: ${readPackageJson().version}`)
      options = result.options

      const deployURL = process.env['DEPLOY_URL']
      let excludeDatastoreFromEngineFunction = options.excludeDatastoreFromEngineFunction
      if (excludeDatastoreFromEngineFunction && !deployURL) {
        reporter.warn(
          'excludeDatastoreFromEngineFunction=true but DEPLOY_URL is not set; disabling option.',
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
export type { AdapterOptions as GatsbyFirebaseAdapterOptions }
export type {
  GatsbyFirebaseFunctionRequest,
  GatsbyFirebaseFunctionResponse,
  GatsbyFirebaseFunctionConfig,
} from './lib/runtime/types.js'
