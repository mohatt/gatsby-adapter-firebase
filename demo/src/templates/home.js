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
      title: 'Routing',
      description: (
        <>
          The adapter translates Gatsby redirects, headers, and page routes into{' '}
          <code>firebase.json</code> so Hosting mirrors your site map.
        </>
      ),
      cta: {
        label: 'See firebase.json output',
        href: 'https://github.com/mohatt/gatsby-adapter-firebase#firebasejson',
      },
    },
    {
      title: 'Server-Side Rendering (SSR)',
      description: (
        <>
          Use <code>getServerData()</code> to run on-demand rendering in Cloud Functions when a
          request arrives. Perfect for dashboards or live data.
        </>
      ),
      cta: { label: 'See the SSR page', to: '/ssr' },
    },
    {
      title: 'Deferred static generation (DSG)',
      description:
        'Ship hundreds of pages without long build times. DSG content renders on the first request and is cached on Firebase Storage.',
      cta: { label: 'Open the DSG page', to: '/dsg' },
    },
    {
      title: 'Gatsby Functions',
      description: (
        <>
          JavaScript files under <code>/src/api</code> gets bundled as Firebase HTTPS functions
          ready for deploy.
        </>
      ),
      cta: { label: 'Call /api/hello-world', href: '/api/hello-world' },
    },
    {
      title: 'Firebase Authentication',
      description:
        'Use Firebase Auth to authenticate users to Cloud Functions, SSR, or API routes.',
      cta: { label: 'Open the auth page', to: '/auth' },
    },
  ]

  const quickChecks = [
    {
      title: 'Inspect the Firebase build output',
      description: (
        <>
          Run <code>gatsby build</code> and the adapter writes Hosting assets and Cloud Functions
          bundles.
        </>
      ),
    },
    {
      title: 'Use the Firebase Emulator Suite',
      description: (
        <>
          Run <code>firebase emulators:start</code> to test your project locally before deploying.
        </>
      ),
    },
    {
      title: 'Deploy with Firebase CLI',
      description: (
        <>
          Run <code>firebase deploy</code> to publish Hosting files, SSR functions, and API
          endpoints.
        </>
      ),
    },
    {
      title: 'Preview changes',
      description: (
        <>Firebase Hosting preview channels let you preview updates before production.</>
      ),
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
            Gatsby on <span className='text-primary'>Firebase Hosting</span>
          </h2>
          <p className='lead text-muted mb-4'>
            {site.siteMetadata.description ||
              'Adapter that maps Gatsby output to Firebase Hosting.'}
          </p>
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
              Firebase Hosting docs
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
                <h3 className='h5 text-dark'>Build and deploy checklist</h3>
                <p className='small text-muted'>
                  Run through these steps to test the adapter locally.
                </p>
                <ol className='mb-0 pl-3'>
                  {quickChecks.map((item, i) => (
                    <li key={item.title} className={i !== quickChecks.length - 1 ? 'mb-2' : ''}>
                      <strong>{item.title}.</strong>{' '}
                      <span className='text-muted'>{item.description}</span>
                    </li>
                  ))}
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
                  <span className='badge badge-info px-3 py-2'>Loading response...</span>
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
