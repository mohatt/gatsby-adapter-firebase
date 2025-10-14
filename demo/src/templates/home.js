import React, { useEffect, useState } from 'react'
import { graphql, Script } from 'gatsby'
import { Link } from 'gatsby-plugin-advanced-pages'
import Layout from '../components/layout'

const HomeTemplate = ({ data: { site } }) => {
  const [apiStatus, setApiStatus] = useState('loading')
  const [apiPayload, setApiPayload] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function fetchApiPayload() {
      try {
        const response = await fetch('/api/hello-world')
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        const payload = await response.json()
        if (isMounted) {
          setApiPayload(payload)
          setApiStatus('ready')
        }
      } catch (error) {
        if (isMounted) {
          setApiStatus('error')
        }
      }
    }

    void fetchApiPayload()

    return () => {
      isMounted = false
    }
  }, [])

  const featureCards = [
    {
      title: 'Static-first builds',
      description:
        'Gatsby pre-renders pages into Firebase Hosting. This home page and the blog are emitted as static assets ready for the CDN.',
      cta: { label: 'Browse the blog', to: 'blog' },
    },
    {
      title: 'Server-Side Rendering (SSR)',
      description:
        'Use getServerData to run on-demand rendering in Cloud Functions. Perfect for dashboards, authenticated content, or live data.',
      cta: { label: 'See the SSR page', to: '/ssr' },
    },
    {
      title: 'Gatsby Functions',
      description:
        'Drop JavaScript files into src/api and the adapter deploys them as callable HTTPS functions next to your site.',
      cta: { label: 'Call /api/hello-world', href: '/api/hello-world' },
    },
    {
      title: 'Deferred static generation (DSG)',
      description:
        'Ship thousands of pages without long build times. DSG content renders on the first request and is cached on Hosting.',
      cta: { label: 'Open the DSG page', to: '/dsg' },
    },
  ]

  const quickChecks = [
    {
      title: 'Inspect the Firebase-ready output',
      description:
        'Run `gatsby build` and the adapter creates both Hosting assets and Cloud Functions bundles with sensible defaults.',
    },
    {
      title: 'Deploy with Firebase CLI',
      description:
        'Use `firebase deploy` to push Hosting content, SSR functions, and API endpoints in one command.',
    },
    {
      title: 'Preview changes safely',
      description:
        'Firebase Hosting preview channels let you preview pull requests without touching production.',
    },
  ]

  const renderCta = (cta) => {
    if (cta.to) {
      return (
        <Link className='btn btn-link px-0' to={cta.to}>
          {cta.label} →
        </Link>
      )
    }

    return (
      <a className='btn btn-link px-0' href={cta.href}>
        {cta.label} →
      </a>
    )
  }

  return (
    <Layout>
      <section className='mb-5'>
        <div className='jumbotron bg-white shadow-sm p-4 p-md-5 mb-0'>
          <h2 className='display-5 mb-3 text-dark'>
            Deploy <span className='text-primary'>Gatsby</span> to Firebase with ease
          </h2>
          <p className='lead text-muted mb-4'>{site.siteMetadata.description}</p>
          <div className='d-flex flex-wrap align-items-center'>
            <a
              className='btn btn-primary mr-3 mb-2'
              href='https://github.com/mohatt/gatsby-adapter-firebase'
            >
              View the adapter on GitHub
            </a>
            <a
              className='btn btn-outline-secondary mb-2'
              href='https://firebase.google.com/docs/hosting'
            >
              Learn about Firebase Hosting
            </a>
          </div>
        </div>
      </section>

      <section className='mb-4'>
        <h2 className='h4 mb-4'>What this demo highlights</h2>
        <div className='row'>
          {featureCards.map((feature) => (
            <div key={feature.title} className='col-6 mb-4'>
              <div className='card h-100 shadow-sm border-0'>
                <div className='card-body'>
                  <h3 className='h5 text-dark'>{feature.title}</h3>
                  <p className='small text-muted mb-0'>{feature.description}</p>
                </div>
                <div className='card-footer bg-transparent border-0 pt-0'>
                  {renderCta(feature.cta)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className='mb-2'>
        <h2 className='h4 mb-3'>Try it yourself</h2>
        <div className='row'>
          <div className='col-lg-7 mb-4'>
            <div className='card h-100 border-0 shadow-sm'>
              <div className='card-body'>
                <h3 className='h5 text-dark'>A typical launch flow</h3>
                <p className='small text-muted'>
                  Run through these steps to take the adapter for a spin in your own Firebase
                  project.
                </p>
                <ol className='mb-0 pl-3'>
                  {quickChecks.map((item) => (
                    <li key={item.title} className='mb-2'>
                      <strong>{item.title}.</strong>{' '}
                      <span className='text-muted'>{item.description}</span>
                    </li>
                  ))}
                  <li className='mb-0'>
                    <strong>Observe live routes.</strong>{' '}
                    <span className='text-muted'>
                      Visit `/ssr` for server rendering, `/about-defer` for DSG, or call an API
                      under `/api/*`.
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
          <div className='col-lg-5'>
            <div className='card border-0 shadow-sm'>
              <div className='card-body'>
                <h3 className='h5 text-dark'>API endpoint status</h3>
                <p className='small text-muted'>
                  This request runs in the browser against the deployed Cloud Function at
                  `/api/hello-world`.
                </p>
                {apiStatus === 'loading' && (
                  <span className='badge badge-info px-3 py-2'>Loading response…</span>
                )}
                {apiStatus === 'ready' && apiPayload && (
                  <pre className='bg-light border rounded small p-3'>
                    {JSON.stringify(apiPayload, null, 2)}
                  </pre>
                )}
                {apiStatus === 'error' && (
                  <span className='badge badge-danger px-3 py-2'>
                    Unable to reach the demo function right now.
                  </span>
                )}
              </div>
              <div className='card-footer bg-transparent border-0 pt-0'>
                <a className='btn btn-link px-0' href='/api/fetch-info'>
                  Inspect API response →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Script id='home-script'>
        {`
          ;(function (){
            const renderTarget = document.querySelector('[data-home-script]')
            if (renderTarget) {
              renderTarget.textContent = 'Client-side script executed: Gatsby adapter demo is hydrated.'
            }
            console.log('Gatsby Firebase demo: inline body script ran at', new Date().toISOString())
          })()
        `}
      </Script>

      <div data-home-script className='small text-muted' />
    </Layout>
  )
}

export const Head = ({ data }) => {
  const { title, description } = data.site.siteMetadata
  return (
    <>
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta name='robots' content='index,follow' />
      <Script id='home-head-script'>
        {`
          ;(function (){
            console.log('Gatsby Firebase demo: inline head script ran at', new Date().toISOString())
          })()
        `}
      </Script>
    </>
  )
}

export const query = graphql`
  query Page($id: String!) {
    page(id: { eq: $id }) {
      title
    }
    site {
      siteMetadata {
        title
        description
      }
    }
  }
`

export default HomeTemplate
