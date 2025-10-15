exports.onRouteUpdate = ({ location }) => {
  if (process.env.NODE_ENV !== `production` || typeof gtag !== `function`) {
    return null
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        const pagePath = location ? location.pathname + location.search + location.hash : undefined
        window.gtag(`event`, `page_view`, { page_path: pagePath })
      }, 0),
    )
  })

  return null
}
