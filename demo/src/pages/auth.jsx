import { useEffect, useState } from 'react'
import { graphql } from 'gatsby'
import { PageLayout, PageHead, AuthGuard } from '../components'
import { useIdToken } from 'react-firebase-hooks/auth'
import { useFirebaseAuth } from '../hooks/firebase'

const codeSnippet = `const token = await user.getIdToken()
await fetch('/api/hello-world', {
  headers: {
    Authorization: \`Bearer \${token}\`,
  },
})`

const AuthenticatedContent = () => {
  const auth = useFirebaseAuth()
  const [user, loading, error] = useIdToken(auth)
  const [tokenDetails, setTokenDetails] = useState(null)

  useEffect(() => {
    ;(async () => {
      if (!user) {
        return
      }

      const idTokenResult = await user.getIdTokenResult()
      setTokenDetails({
        uid: user.uid,
        email: user.email || 'Not provided',
        provider: user.providerData?.[0]?.providerId || 'firebase',
        issuedAt: idTokenResult.issuedAtTime,
        expiresAt: idTokenResult.expirationTime,
        hasCustomClaims: Object.keys(idTokenResult.claims || {}).length > 0,
        claims: idTokenResult.claims || {},
      })
    })()
  }, [user])

  return (
    <div className='row'>
      <div className='col-lg-6 mb-4'>
        <div className='card h-100 border-0 shadow-sm p-2'>
          <div className='card-body'>
            <h3 className='h5 text-dark mb-3'>Authenticated session details</h3>
            <p className='small text-muted'>These values come from Firebase Auth SDK.</p>
            {loading && <span className='badge text-bg-info px-3 py-2'>Loading token...</span>}
            {error && (
              <div className='alert alert-danger mt-3 mb-0' role='alert'>
                <h4 className='alert-heading'>Unable to load the ID token</h4>
                <p className='mb-0'>{error.message}</p>
              </div>
            )}
            {tokenDetails && (
              <dl className='row small mb-0'>
                <dt className='col-sm-5 text-uppercase text-muted'>UID</dt>
                <dd className='col-sm-7 font-monospace'>{tokenDetails.uid}</dd>
                <dt className='col-sm-5 text-uppercase text-muted'>Email</dt>
                <dd className='col-sm-7'>{tokenDetails.email}</dd>
                <dt className='col-sm-5 text-uppercase text-muted'>Provider</dt>
                <dd className='col-sm-7'>{tokenDetails.provider}</dd>
                <dt className='col-sm-5 text-uppercase text-muted'>Issued</dt>
                <dd className='col-sm-7'>{tokenDetails.issuedAt}</dd>
                <dt className='col-sm-5 text-uppercase text-muted'>Expires</dt>
                <dd className='col-sm-7'>{tokenDetails.expiresAt}</dd>
                <dt className='col-sm-5 text-uppercase text-muted'>Custom claims</dt>
                <dd className='col-sm-7'>
                  {tokenDetails.hasCustomClaims ? 'Available' : 'None added yet'}
                </dd>
              </dl>
            )}
          </div>
        </div>
      </div>
      <div className='col-lg-6 mb-4'>
        <div className='card h-100 border-0 shadow-sm p-2'>
          <div className='card-body'>
            <h3 className='h5 text-dark mb-3'>Send the token to your backend</h3>
            <p className='small text-muted'>
              Functions or SSR handlers can decode the same ID token to enforce access control. Add
              the header below to any request that should carry credentials.
            </p>
            <pre className='bg-light border rounded small p-3 mb-3'>
              <code>{codeSnippet}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

const Auth = () => (
  <PageLayout title='Authentication'>
    <section className=''>
      <p className='text-muted mb-3 lead'>
        This page shows how client code can add an authentication layer using Firebase SDK.
      </p>
    </section>
    <AuthGuard title='You are signed in'>
      <AuthenticatedContent />
    </AuthGuard>
    <section className='mt-2'>
      <div className='card border-0 shadow-sm p-2'>
        <div className='card-body'>
          <ul className='small text-muted mb-0'>
            <li>Rendered as a standard Gatsby page, guarded client-side with Firebase Auth.</li>
            <li>
              Uses <code>react-firebase-hooks</code> for a minimal Google sign-in flow.
            </li>
            <li>Signed-in users can forward ID tokens to Cloud Functions, SSR, or API routes.</li>
          </ul>
        </div>
      </div>
    </section>
  </PageLayout>
)

export const Head = () => <PageHead title='Authentication' />

export const query = graphql`
  query Auth {
    site {
      siteMetadata {
        title
        description
      }
    }
  }
`

export default Auth
