# Gatsby adapter for Firebase

[![NPM Version][npm-img]][npm-url] [![Build Status][ci-img]][ci-url] [![Code Coverage][codecov-img]][codecov-url] [![Gatsby Version][gatsby-img]][gatsby-url] [![GitHub License][license-img]][license-url]

Intro here.

---

- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [License](#license)

## Installation

Install with your favorite package manager:

```zsh
$ npm install gatsby-adapter-firebase
```

## Usage

> **Note:** Your Gatsby version must be 5.12.0 or newer, which is where [adapters](https://www.gatsbyjs.com/docs/how-to/previews-deploys-hosting/adapters/) were introduced.

Enable the adaptor in `gatsby-config.js`.

```js
// `gatsby-config.js`
import firebaseAdapter from 'gatsby-adapter-firebase'

/** @type {import('gatsby').GatsbyConfig} */
export default {
  adapter: firebaseAdapter(),
}
```

## Options

Options here.

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
