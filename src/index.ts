import path from 'node:path'
import type { AdapterInit } from 'gatsby'
import type { AdapterOptions } from './lib/types.js'
import { prepareFunctionsWorkspace } from './lib/functions-builder.js'
import { transformRoutes } from './lib/routes-transform.js'
import { mergeFirebaseJson } from './lib/firebase-merge.js'
import { readPackageJson, relativeTo, toPosix } from './lib/utils.js'

const createAdapter: AdapterInit<AdapterOptions> = (adapterOptions = {}) => {
  const target = adapterOptions.target ?? 'gatsby'
  const region = adapterOptions.region ?? 'us-central1'
  const publicDir = adapterOptions.publicDir ?? 'public'
  const functionsOutDirOption = adapterOptions.functionsOutDir ?? '.firebase/functions'
  const functionsCodebase = adapterOptions.functionsCodebase ?? 'gatsby'
  const functionsRuntime = adapterOptions.functionsRuntime ?? 'nodejs20'

  return {
    name: 'gatsby-adapter-firebase',

    async adapt({ routesManifest, functionsManifest, pathPrefix, reporter }) {
      const projectRoot = process.cwd()
      const functionsOutDir = path.resolve(projectRoot, functionsOutDirOption)
      const firebaseJsonPath = path.join(projectRoot, 'firebase.json')

      const { prepared, idMap } = await prepareFunctionsWorkspace({
        functions: functionsManifest,
        outDir: functionsOutDir,
        projectRoot,
        reporter,
        runtime: functionsRuntime,
      })

      const { redirects, rewrites, headers } = transformRoutes({
        routes: routesManifest,
        pathPrefix,
        reporter,
        functionIdMap: idMap,
        region,
      })

      const functionsEntry = prepared
        ? {
            codebase: functionsCodebase,
            source: relativeTo(projectRoot, functionsOutDir) || '.',
            runtime: functionsRuntime,
          }
        : undefined

      const { wrote } = await mergeFirebaseJson({
        filePath: firebaseJsonPath,
        hostingTarget: target,
        publicDir,
        redirects,
        rewrites,
        headers,
        functionsEntry,
      })

      const infoParts = [
        `target=${target}`,
        `redirects=${redirects.length}`,
        `rewrites=${rewrites.length}`,
        `headers=${headers.length}`,
        `functions=${prepared?.exports.length ?? 0}`,
      ]
      reporter.info(
        `[gatsby-adapter-firebase] firebase.json ${wrote ? 'updated' : 'unchanged'} · ${
          infoParts.join(', ')
        } (use --verbose for breakdown)`,
      )

      if (prepared?.exports.length) {
        const mapped = prepared.exports.map((fn) => `${fn.originalId} → ${fn.deployedId}`)
        reporter.verbose(
          `[gatsby-adapter-firebase] functions codebase ${
            [`${functionsCodebase} → ${toPosix(functionsOutDir)}`].concat(mapped).join('\n · ')
          }`,
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
