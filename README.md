# Gatsby adapter for Firebase

[![NPM Version][npm-img]][npm-url] [![Build Status][ci-img]][ci-url] [![Code Coverage][codecov-img]][codecov-url] [![Gatsby Version][gatsby-img]][gatsby-url] [![GitHub License][license-img]][license-url]

This [adapter](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/adapters/) enables the following features on [Firebase](https://firebase.google.com/). Try it live at [gatsbyfire.web.app](https://gatsbyfire.web.app/).

- [Redirects](https://www.gatsbyjs.com/docs/reference/config-files/actions/#createRedirect)
- [HTTP Headers](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/headers/)
- Application of [default caching headers](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/caching/)
- [Deferred Static Generation (DSG)](https://www.gatsbyjs.com/docs/how-to/rendering-options/using-deferred-static-generation/)
- [Server-Side Rendering (SSR)](https://www.gatsbyjs.com/docs/how-to/rendering-options/using-server-side-rendering/)
- [Gatsby Functions](https://www.gatsbyjs.com/docs/reference/functions/)
- Gatsby Image and File CDN through Firebase Hosting’s global CDN

---

- [Installation](#installation)
- [Usage](#usage)
- [`firebase.json`](#firebasejson)
- [Firebase functions](#firebase-functions)
- [Adapter options](#adapter-options)
- [DSG and SSR functions](#dsg-functions)
- [Local workflows](#local-workflows)
- [License](#license)

## Installation

```zsh
npm install gatsby-adapter-firebase
```

You will also need Firebase CLI if plan to do local deployments or use [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite):

```zsh
npm install -g firebase-tools
```

## Usage

> Your Gatsby version must be 5.12.0 or newer, which is when [adapters](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/adapters/) were introduced.

### Configure Gatsby

Add the adapter to `gatsby-config.js`:

```js
// gatsby-config.js
const firebaseAdapter = require('gatsby-adapter-firebase')

/** @type {import('gatsby').GatsbyConfig} */
module.exports = {
  adapter: firebaseAdapter(),
}
```

### Build and deploy

Run a Gatsby build as usual. The adapter hooks into Gatsby’s post-build phase:

```zsh
npm run build
```

This will either create or update your `firebase.json` and build `.firebase/functions/` if you're using SSR, DSG, or standard functions.

Next, point your Firebase Hosting target at the desired site (once per project):

```zsh
firebase --project <project-id> target:apply hosting gatsby <site-id>
```

Finally, deploy the project to Firebase or run locally using [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite):

```zsh
firebase deploy
# or
firebase emulators:start --project demo-site
```

For local emulator setup and deployment limitations, see [Local workflows](#local-workflows).

## firebase.json

During `gatsby build` the adapter reads `firebase.json`, updates the entry matching the configured Hosting target (default `gatsby`), and writes it back.

### Key behaviors:

- Existing `hosting` entries for other targets are preserved.
- The adapter merges the generated config into the entry for the target, replacing its `redirects`, `rewrites`, and `headers` with the data derived from Gatsby.
- When Cloud Functions are produced, the `functions` section is merged by codebase name (default `gatsby`). Other codebases remain untouched.
- If the file is missing, it is created with just the generated data and other Firebase defaults.
- Other config sections are preserved.

Because this file is regenerated on every build, it is safer to keep the version committed to source control as small as possible. Track only the entries and configs you maintain by hand, ignore `.firebase/`, and avoid staging the adapter-generated files unless you are pinning a deliberate override.

## Firebase functions

The adapter packages Gatsby Functions (SSR, DSG, and standard functions) into a Firebase Functions codebase. Functions are written to `.firebase/functions`. Each Gatsby function is built into a single Firebase function. If you opted for [Deferred Static Generation (DSG)](https://www.gatsbyjs.com/docs/how-to/rendering-options/using-deferred-static-generation/), the SSR engine function will be built into two separate functions:

- A default function for SSR function handler.
- A cached [DSG variant](#dsg-functions) for pages marked with `defer: true`.

The default runtime is `nodejs20`; override it with the [`functionsRuntime`](#adapter-options) option. The directory is re-created on each build, so do not commit it.

## Adapter options

Pass options to the adapter factory in `gatsby-config`:

```js
adapter: firebaseAdapter({
  hostingTarget: 'gatsby',
  functionsOutDir: '.firebase/functions',
  functionsCodebase: 'gatsby',
  functionsRuntime: 'nodejs20',
  functionsConfig: { region: 'us-central1' },
  functionsConfigOverride: { 'ssr-engine': { memory: '512MiB' } },
  excludeDatastoreFromEngineFunction: false,
})
```

#### hostingTarget

The Firebase Hosting target in `firebase.json` to replace. Match this with:

```zsh
firebase --project <project-id> target:apply hosting <target> <site-id>
```

#### functionsOutDir

Directory for the generated Firebase Functions workspace.

#### functionsCodebase

The `codebase` name used in `firebase.json`.

#### functionsRuntime

Runtime string passed to Firebase (for example `nodejs20`).

#### functionsConfig

Default HTTPS options applied to every generated function.

#### functionsConfigOverride

Per-function overrides keyed by Gatsby `functionId`. Append `-cached` to target the cached variant (e.g. `ssr-engine-cached`).

#### excludeDatastoreFromEngineFunction

When `true`, the adapter keeps Gatsby’s LMDB datastore out of SSR/DSG bundles. Set `DEPLOY_URL` env var during the build so the functions can download the datastore on demand; otherwise the option is ignored.

## DSG functions

The adapter supports **Deferred Static Generation (DSG)** by automatically creating a cached variant of Gatsby SSR Function if needed. It behave similarly to Gatsby Cloud but rely on **Firebase Storage**.

> To enable DSG caching, your Firebase project must have **Cloud Storage** enabled.  
> If Storage is disabled or no default bucket exists, DSG function will gracefully fall back to **standard SSR** behavior with no caching.

### Key characteristics

- They accept only `GET` and `HEAD` requests.
- They use the default Firebase Storage bucket to store caches under `.gatsby-adapter-firebase/<functionId>/<functionVersion>`.
- If Storage is unreachable for any reason, the request falls back to the uncached handler and returns `X-Gatsby-Firebase-Cache: PASS`.
- They use the request’s URL path to determine whether to create a new cache object or reuse an existing one.
- On a miss, the underlying Gatsby handler runs. The proxy records outgoing chunks for `GET` requests only.
- When the response finishes with status `2xx`, `301`, `302`, `307`, `308`, or `404`, the payload and headers are written to Storage.
- Cached requests return `X-Gatsby-Firebase-Cache: HIT`. All other statuses skip caching and return `MISS`.

The handler always sets `cache-control` unless the function already provided one:

- Cacheable responses get `public, max-age=0, must-revalidate`.
- Non-cacheable responses get `no-store`.
- Unsupported methods respond with `405 Method Not Allowed` and `cache-control: no-store`.

Cache keys are per function version and URL path, so changing the Gatsby function code automatically invalidates the cache on the next deployment.

## Local workflows

### Local deployment

Deploying functions from a local machine only works on Linux (or within a Docker container); other operating systems will produce an error like:

> Error: Incompatible DSG/SSR executing environment. Function was built for "linux/x64" but is executing on "darwin/x64".

This is because Gatsby bundles platform-specific binaries inside functions—and Firebase CLI evaluates the functions code before deploying it.

### Local testing

You can run the project locally using Firebase Local Emulator Suite.

```zsh
firebase emulators:start --project demo-site
```

If you are using DSG, you will need Firebase Storage emulator to be enabled in your `firebase.json`.

```json
{
  "emulators": {
    "storage": {
      "port": 9199
    }
  }
}
```

## License

[MIT][license-url]

[npm-url]: https://www.npmjs.com/package/gatsby-adapter-firebase
[npm-img]: https://img.shields.io/npm/v/gatsby-adapter-firebase.svg?logo=npm
[ci-url]: https://github.com/mohatt/gatsby-adapter-firebase/actions/workflows/ci.yml
[ci-img]: https://img.shields.io/github/actions/workflow/status/mohatt/gatsby-adapter-firebase/ci.yml?branch=main&logo=github
[codecov-url]: https://codecov.io/github/mohatt/gatsby-adapter-firebase
[codecov-img]: https://img.shields.io/codecov/c/github/mohatt/gatsby-adapter-firebase.svg?logo=codecov&logoColor=white
[gatsby-url]: https://www.gatsbyjs.org/packages/gatsby-adapter-firebase
[gatsby-img]: https://img.shields.io/badge/gatsby->=5.12-blueviolet.svg?logo=gatsby
[license-url]: https://github.com/mohatt/gatsby-adapter-firebase/blob/master/LICENSE
[license-img]: https://img.shields.io/github/license/mohatt/gatsby-adapter-firebase.svg?logo=open%20source%20initiative&logoColor=white
