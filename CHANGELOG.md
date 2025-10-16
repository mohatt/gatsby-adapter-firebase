## [1.4.2](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.4.1...v1.4.2) (2025-10-16)


### Bug Fixes

* **options:** restrict `functionsRuntime` option to `nodejs20` and `nodejs22` ([af317c2](https://github.com/mohatt/gatsby-adapter-firebase/commit/af317c284f9f5918d316c0fc0123906ae2c8142e))

## [1.4.1](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.4.0...v1.4.1) (2025-10-16)


### Bug Fixes

* **build:** fix minor build issue in `functionsPlatform` ([21791b9](https://github.com/mohatt/gatsby-adapter-firebase/commit/21791b9c5a9ae8b1fa1357ae573c32e54987b6e4))

# [1.4.0](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.3.0...v1.4.0) (2025-10-16)


### Features

* **runtime:** add `storageBucket` option for cached responses ([dfbad17](https://github.com/mohatt/gatsby-adapter-firebase/commit/dfbad17871e686a013e4af4841471b2ddb8343db))


### Performance Improvements

* **runtime:** omit `file.exists()` api call to speed up `readCachedResponse` ([429423d](https://github.com/mohatt/gatsby-adapter-firebase/commit/429423d9eed98f460100f0e803a26d727e35517b))

# [1.3.0](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.2.1...v1.3.0) (2025-10-16)


### Features

* **runtime:** add version metadata to cache entries to skip stale responses ([bb92801](https://github.com/mohatt/gatsby-adapter-firebase/commit/bb9280146e3950cc2810153bbec7fea97f6cfea8))


### Performance Improvements

* **runtime:** introduce `CacheManager` to encapsulate bucket and cache operations for each handler separately ([138d954](https://github.com/mohatt/gatsby-adapter-firebase/commit/138d954ef287a8f371395eb60f0772c6d73e8336))

## [1.2.1](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.2.0...v1.2.1) (2025-10-15)


### Bug Fixes

* **runtime:** normalize trailing slash in cache key for `ssr-engine-cached` to avoid duplication ([24e8127](https://github.com/mohatt/gatsby-adapter-firebase/commit/24e81275a96f767be8e8f28bf7cc45ada9bcdd17))

# [1.2.0](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.1.1...v1.2.0) (2025-10-15)


### Bug Fixes

* **hosting:** fix trailing slash issue in static asset routes ([19731ab](https://github.com/mohatt/gatsby-adapter-firebase/commit/19731ab3c2e5ea72cdf0e28cc9a5cc5eb35b9124))


### Features

* **hosting:** refactor Gatsby redirect transform logic ([fef4d12](https://github.com/mohatt/gatsby-adapter-firebase/commit/fef4d12050f45e52992ef564fb236813d490d365))

## [1.1.1](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.1.0...v1.1.1) (2025-10-14)


### Bug Fixes

* use `regex` for function rewrites to handle trailing slashes ([307a2c3](https://github.com/mohatt/gatsby-adapter-firebase/commit/307a2c3aa1c248c44e371e09d336dff281390120))

# [1.1.0](https://github.com/mohatt/gatsby-adapter-firebase/compare/v1.0.0...v1.1.0) (2025-10-14)


### Features

* first release 🎉 ([69ed1f9](https://github.com/mohatt/gatsby-adapter-firebase/commit/69ed1f92f326944923a2433ee2613190055ef4b6))
