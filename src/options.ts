import { Joi, validateOptionsSchema } from 'gatsby-plugin-utils'
import type { BuildHostingOptions } from './lib/build-hosting.js'
import type { BuildFunctionsOptions } from './lib/build-functions.js'

export interface AdapterOptions
  extends Partial<BuildHostingOptions>,
    Partial<BuildFunctionsOptions> {
  excludeDatastoreFromEngineFunction?: boolean
}

export type ValidatedAdapterOptions = Readonly<Required<AdapterOptions>>

export type ValidatedAdapterResult =
  | { options: ValidatedAdapterOptions; warnings?: string[] }
  | { errors: string[] }

/**
 * Defines the schema for adaptor options.
 */
export const getOptionsSchema = () => {
  return Joi.object({
    hostingTarget: Joi.string().default('gatsby'),
    functionsConfig: Joi.object().default(undefined),
    functionsConfigOverride: Joi.object().default({}),
    functionsOutDir: Joi.string().default('.firebase/functions'),
    functionsCodebase: Joi.string().default('gatsby'),
    functionsRuntime: Joi.string().default('nodejs20'),
    excludeDatastoreFromEngineFunction: Joi.boolean().default(false),
  })
}

export const validateOptions = async (options: AdapterOptions): Promise<ValidatedAdapterResult> => {
  try {
    const { value, warning } = await validateOptionsSchema(
      getOptionsSchema(),
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
