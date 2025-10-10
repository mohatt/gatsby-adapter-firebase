# Gatsby adapter for Firebase

[![NPM Version][npm-img]][npm-url] [![Build Status][ci-img]][ci-url] [![Code Coverage][codecov-img]][codecov-url] [![Gatsby Version][gatsby-img]][gatsby-url] [![GitHub License][license-img]][license-url]

Gatsby [adapter](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/adapters/) for [Firebase](https://firebase.google.com/).

This adapter enables following features on Firebase:

- [Redirects](https://www.gatsbyjs.com/docs/reference/config-files/actions/#createRedirect)
- [HTTP Headers](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/headers/)
- Application of [default caching headers](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/caching/)
- [Deferred Static Generation (DSG)](https://www.gatsbyjs.com/docs/how-to/rendering-options/using-deferred-static-generation/)
- [Server-Side Rendering (SSR)](https://www.gatsbyjs.com/docs/how-to/rendering-options/using-server-side-rendering/)
- [Gatsby Functions](https://www.gatsbyjs.com/docs/reference/functions/)
- ~~Caching of builds between deploys~~
- Gatsby Image and File CDN through Firebase Hosting’s global CDN
  - [ ] Support for storing static assets in a separate Cloud Storage bucket

---

- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [License](#license)

## Installation

```zsh
$ npm install gatsby-adapter-firebase
```

## Usage

> **Note:** Your Gatsby version must be 5.12.0 or newer, which is where [adapters](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/adapters/) were introduced.

Add `gatsby-adapter-firebase` to your [`gatsby-config`](https://www.gatsbyjs.com/docs/reference/config-files/gatsby-config/) and configure the [`adapter`](https://www.gatsbyjs.com/docs/reference/config-files/gatsby-config/#adapter) option.

```js
// `gatsby-config.js`
import firebaseAdapter from 'gatsby-adapter-firebase'

/** @type {import('gatsby').GatsbyConfig} */
export default {
  adapter: firebaseAdapter(),
}
```

```zsh
$ npm run build
```
the above command will generate a firebase.json file or merge into existing one.

make sure you have firebase-tools installed globally.
```zsh
$ npm install -g firebase-tools
```

```zsh
$ firebase --project {} target:apply hosting gatsby {}
```

```zsh
$ firebase deploy
```

## Options

#### excludeDatastoreFromEngineFunction
> `type: boolean, default = false`

If `true`, Gatsby will not include the LMDB datastore in the serverless functions used for SSR/DSG. Instead, it will upload the datastore to Firebase's CDN and download it on first load of the functions.

> **Note:** This option requires setting `DEPLOY_URL={url}` environment variable when building your Gatsby site.


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
