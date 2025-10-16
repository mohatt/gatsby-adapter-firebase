import { graphql } from 'gatsby'
import { PageHead, PageLayout } from '../components'

const SSR = ({ serverData }) => {
  if (serverData?.error) {
    return (
      <PageLayout title='Server-side Rendering (SSR)'>
        <p className='text-danger'>We could not fetch a dog photo right now.</p>
        <p className='text-muted small'>{serverData.error}</p>
      </PageLayout>
    )
  }

  const fetchedAt = serverData?.fetchedAt
    ? new Date(serverData.fetchedAt).toLocaleString()
    : 'unknown time'

  return (
    <PageLayout title='Server-side Rendering (SSR)'>
      <p className='lead content'>
        Every visit to this page triggers <code>getServerData()</code>. Gatsby Firebase adapter
        executes that handler in a Cloud Function, fetches fresh data from{' '}
        <a href='https://dog.ceo/dog-api/'>Dog CEO</a>, and streams the HTML response back through
        Firebase Hosting.
      </p>
      <div className='card border-0 mb-4 shadow-sm content'>
        <pre className='m-2 p-3'>
          <code>{JSON.stringify(serverData, null, 2)}</code>
        </pre>
      </div>
      <div className='card border-0 shadow-sm content'>
        <img
          alt='Happy dog sourced at request time'
          src={serverData.dogUrl}
          className='card-img-top content'
        />
        <div className='card-body'>
          <p className='mb-1'>Rendered at: {fetchedAt}</p>
          <p className='small text-muted mb-0'>
            Refresh the page to trigger a new Cloud Function invocation and fetch another photo.
          </p>
        </div>
      </div>
    </PageLayout>
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

export const Head = () => <PageHead title='Server-side Rendering (SSR)' />

export const query = graphql`
  query SSR {
    site {
      siteMetadata {
        title
        description
      }
    }
  }
`

export default SSR
