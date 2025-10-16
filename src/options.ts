import { Joi, PluginOptionsSchemaJoi, validateOptionsSchema } from 'gatsby-plugin-utils'
import type { BuildHostingOptions } from './lib/build-hosting.js'
import type { BuildFunctionsOptions } from './lib/build-functions.js'

export interface AdapterOptions extends Partial<BuildHostingOptions & BuildFunctionsOptions> {
  excludeDatastoreFromEngineFunction?: boolean
}

export type ValidatedAdapterOptions = Readonly<Required<AdapterOptions>>

export type ValidatedAdapterResult =
  | { options: ValidatedAdapterOptions; warnings?: string[] }
  | { errors: string[] }

/**
 * Defines the schema for adaptor options.
 */
export const getOptionsSchema = (joi: PluginOptionsSchemaJoi) => {
  return joi
    .object({
      hostingTarget: joi
        .string()
        .description('Firebase Hosting target name to update within firebase.json')
        .default('gatsby'),
      functionsConfig: joi
        .object()
        .unknown(true)
        .description('Default firebase-functions HTTPS options applied to every generated function')
        .optional(),
      functionsConfigOverride: joi
        .object()
        .pattern(
          joi.string(),
          joi.object().unknown(true).description('HTTPS options override for a single function'),
        )
        .description(
          'Per-function overrides keyed by original Gatsby functionId, merged on top of functionsConfig',
        )
        .default({}),
      functionsOutDir: joi
        .string()
        .description(
          'Directory (relative to project root) where the adapter writes the functions codebase',
        )
        .default('.firebase/functions'),
      functionsCodebase: joi
        .string()
        .description('Firebase codebase name used when registering the generated functions bundle')
        .default('gatsby'),
      functionsRuntime: joi
        .string()
        .valid('nodejs20', 'nodejs22')
        .description('Runtime identifier (e.g. nodejs20) used for generated Firebase functions')
        .default('nodejs20'),
      storageBucket: joi
        .string()
        .description(
          'Cloud Storage bucket name used for cached responses (defaults to project bucket)',
        ),
      excludeDatastoreFromEngineFunction: joi
        .boolean()
        .description('Skip bundling Gatsby LMDB datastore in the functions used for SSR/DSG')
        .default(false),
    })
    .label('options')
}

export const validateOptions = async (options: AdapterOptions): Promise<ValidatedAdapterResult> => {
  try {
    const { value, warning } = await validateOptionsSchema(
      getOptionsSchema(Joi),
      options as Record<string, unknown>,
    )
    return {
      options: value as ValidatedAdapterOptions,
      warnings: warning?.details.length ? warning.details.map((w) => w.message) : undefined,
    }
  } catch (err) {
    return {
      errors: Array.isArray(err.details)
        ? (err.details as Array<{ message: string }>).map((e) => e.message)
        : [String(err)],
    }
  }
}
