const adapter = require('gatsby-adapter-firebase')
const advancedPages = require('./advanced-pages')

/** @type {import('gatsby').GatsbyConfig} */
module.exports = {
  adapter: adapter(),
  plugins: [
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        path: `content`,
        name: `content`,
      },
    },
    `gatsby-plugin-image`,
    'gatsby-transformer-sharp',
    {
      resolve: 'gatsby-plugin-sharp',
      options: {
        defaults: {
          transformOptions: {
            cropFocus: 'center',
          },
          quality: 90,
        },
      },
    },
    `gatsby-transformer-remark`,
    {
      resolve: `gatsby-plugin-advanced-pages`,
      options: advancedPages,
    },
  ],
  headers: [
    {
      source: '/*',
      headers: [
        {
          key: 'Link',
          value:
            '</bootstrap.min.css>; rel=preload; as=style, <https://www.googletagmanager.com>; rel=preconnect, <https://www.google-analytics.com>; rel=preconnect',
        },
      ],
    },
    {
      source: `/blog/*`,
      headers: [
        {
          key: `x-blog-header`,
          value: `test`,
        },
      ],
    },
    {
      source: `/blog/:slug`,
      headers: [
        {
          key: `x-blog-post-header`,
          value: `test`,
        },
      ],
    },
  ],
  siteMetadata: {
    title: `Gatsby Adapter for Firebase`,
    description: `Explore how Gatsby Firebase Adapter serves static, SSR and DSG pages and API endpoints on Firebase Hosting’s global CDN and Cloud Functions.`,
  },
  jsxRuntime: 'automatic',
}
