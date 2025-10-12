//const adapter = require("../dist/index.cjs")

module.exports = {
  //adapter: adapter(),
  plugins: [
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        path: `${__dirname}/content`,
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
  ]
}
