const adapter = require('gatsby-adapter-firebase')

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
    `gatsby-plugin-advanced-pages`,
  ],
  headers: [
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
    description: `Explore how the Gatsby Firebase adapter serves static pages, SSR routes, API endpoints, and DSG content on Firebase Hosting and Cloud Functions.`,
  },
}
