exports.createPages = async ({ actions }) => {
  const { createRedirect, createPage } = actions

  createPage({
    path: `about-defer`,
    component: require.resolve(`./src/templates/about-defer.js`),
    context: {
      name: `Defer test`,
    },
    defer: true,
  })

  createRedirect({
    fromPath: `/en/old-blog`,
    toPath: `/blog`,
  })

  createRedirect({
    fromPath: `/old-blog/*`,
    toPath: `/blog/*`,
  })

  createRedirect({
    fromPath: `/old-blog?tag=:id`,
    toPath: `/blog/:id`,
  })

  createRedirect({
    fromPath: `/docs/*`,
    toPath: `https://www.awesomesite.com/docs/*`,
    statusCode: 200,
  })

  createRedirect({
    fromPath: `/blog/*`,
    toPath: `/zh/blog/*`,
    conditions: {
      language: [`zh`],
    },
  })
}
