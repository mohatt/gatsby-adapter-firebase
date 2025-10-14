import React from 'react'
import { graphql } from 'gatsby'
import Layout from '../components/layout'

const SSRPage = ({ serverData }) => {
  if (serverData?.error) {
    return (
      <Layout title='SSR Page with Dogs'>
        <p className='text-danger'>We could not fetch a dog photo right now.</p>
        <p className='text-muted small'>{serverData.error}</p>
      </Layout>
    )
  }

  const fetchedAt = serverData?.fetchedAt
    ? new Date(serverData.fetchedAt).toLocaleString()
    : 'unknown time'

  return (
    <Layout title='SSR Page with Dogs'>
      <p>
        Every visit to this page triggers <code>getServerData</code>. Gatsby Firebase adapter
        executes that handler in a Cloud Function, fetches fresh data from{' '}
        <a href='https://dog.ceo/dog-api/'>Dog CEO</a>, and streams the HTML response back through
        Firebase Hosting.
      </p>
      <div className='card border-0 mb-4 shadow-sm w-75'>
        <pre className='p-2 m-2'><code>{JSON.stringify(serverData, null, 2)}</code></pre>
      </div>
      <div className='card border-0 shadow-sm w-50'>
        <img alt='Happy dog sourced at request time' src={serverData.dogUrl} className='card-img-top' width='500' />
        <div className='card-body'>
          <p className='mb-1'>Rendered at: {fetchedAt}</p>
          <p className='small text-muted mb-0'>
            Refresh the page to trigger a new Cloud Function invocation and fetch another photo.
          </p>
        </div>
      </div>
    </Layout>
  )
}

export const getServerData = async (props) => {
  try {
    const res = await fetch(`https://dog.ceo/api/breeds/image/random`)

    if (!res.ok) {
      throw new Error(`Response failed`)
    }

    const payload = await res.json()

    return {
      props: {
        dogUrl: payload.message,
        status: payload.status,
        fetchedAt: new Date().toISOString(),
      },
    }
  } catch (error) {
    return {
      status: 500,
      headers: {},
      props: {
        error: error.message,
      },
    }
  }
}

export const Head = ({ data }) => (
  <>
    <title>Server-Side Rendering</title>
    <meta name='description' content={data.site.siteMetadata.description} />
  </>
)

export const query = graphql`
  query Dsg {
    site {
      siteMetadata {
        title
        description
      }
    }
  }
`

export default SSRPage
