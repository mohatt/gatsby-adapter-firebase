exports.createPages = async ({ actions }) => {
  const { createRedirect, createPage } = actions

  createPage({
    path: `dsg`,
    component: require.resolve(`./src/templates/dsg.js`),
    context: {
      name: `Defer test`,
    },
    defer: true,
  })

  createRedirect({
    fromPath: `/old-blog/*`,
    toPath: `/blog/*`,
  })
}
