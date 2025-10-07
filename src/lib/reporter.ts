import type { Reporter } from 'gatsby'

/**
 * Adaptor name
 */
export const ADAPTOR = 'gatsby-adaptor-firebase'

/**
 * Wrapper around Gatsby's reporter, providing structured logging,
 * error handling, and lifecycle management for adaptor diagnostics.
 * @internal
 */
export class AdaptorReporter {
  /***
   * If `setErrorMap` is available, registers custom error messages
   * for better debugging in Gatsby's CLI.
   */
  constructor(readonly ref: Reporter) {
    ref.setErrorMap?.({
      [`${ADAPTOR}_1800` satisfies IErrorMeta['id']]: {
        text: (context: IErrorMeta['context']) => context.message,
        type: 'ADAPTER',
        level: 'ERROR',
        category: 'USER',
        docsUrl: `https://github.com/mohatt/${ADAPTOR}`,
      },
    })
  }

  /**
   * Builds a structured error meta object.
   */
  createError(phase: string, err: string | AdaptorError | Error): IErrorMeta {
    const prefix = `The adaptor threw an error during "${phase}" phase`

    let title: string | undefined
    let mainError: Error | undefined

    if (err instanceof AdaptorError) {
      title = err.message
      mainError = err.originalError
    } else if (err instanceof Error) {
      mainError = err
    } else {
      title = err
    }

    return {
      id: `${ADAPTOR}_1800`,
      context: {
        message: mainError && title ? `${prefix}:\n ${title}` : prefix,
      },
      error: mainError ?? (title ? new Error(title) : undefined),
    }
  }

  /**
   * Creates a new activity timer for reporting progress.
   */
  activity(phase: string, title: string) {
    return new AdaptorActivity(this, phase, title)
  }

  /**
   * Logs an error and terminates the build process.
   */
  error(phase: string, err: string | AdaptorError | Error): never {
    const meta = this.createError(phase, err)
    return this.ref.panic(meta)
  }

  /**
   * Logs a warning message in the Gatsby CLI.
   */
  warn(message: string) {
    const warning = `[${ADAPTOR}]: ${message}`
    this.ref.warn(warning)
  }

  /**
   * Logs an info message in the Gatsby CLI.
   */
  info(message: string) {
    this.ref.info(`[${ADAPTOR}]: ${message}`)
  }

  /**
   * Logs a verbose message in the Gatsby CLI.
   */
  verbose(message: string) {
    this.ref.verbose(`[${ADAPTOR}]: ${message}`)
  }
}

class AdaptorActivity {
  readonly ref: ReturnType<Reporter['activityTimer']>

  constructor(
    readonly reporter: AdaptorReporter,
    readonly phase: string,
    readonly title: string,
  ) {
    this.ref = reporter.ref.activityTimer(`[${ADAPTOR}]: ${title}`)
  }

  start() {
    this.ref.start()
  }

  end() {
    this.ref.end()
  }

  setStatus(status: string) {
    this.ref.setStatus(status)
  }

  error(err: string | AdaptorError | Error) {
    return this.ref.panic(this.reporter.createError(this.phase, err))
  }

  async run<R>(
    fn: Promise<R> | ((setStatus: AdaptorActivity['setStatus']) => R | Promise<R>),
  ): Promise<[result: R, error: unknown]> {
    try {
      this.start()
      const resultPromise = typeof fn === 'function' ? fn(this.setStatus.bind(this)) : fn
      const result = await resultPromise
      this.end()
      return [result, null]
    } catch (err) {
      this.error(err)
      return [null, err]
    }
  }
}

/**
 * The main adaptor error representation in Gatsby's error map.
 */
export interface IErrorMeta {
  id: `${typeof ADAPTOR}_1800`
  context: {
    message: string
  }
  error: Error
}

/**
 * Custom error class for adaptor-related errors.
 */
export class AdaptorError extends Error {
  /**
   * @param message - A description of the error.
   * @param originalError - The original error that caused this issue (optional).
   */
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message)
  }
}
