import React from 'react'
import { useAuthState, useSignInWithGoogle, useSignOut } from 'react-firebase-hooks/auth'
import { useFirebaseAuth } from './hooks'

const AuthGuard = ({ title, children }) => {
  const auth = useFirebaseAuth()
  const [authState, authStateLoading, authStateError] = useAuthState(auth)
  const [signIn, , signInLoading, signInError] = useSignInWithGoogle(auth)
  const [signOut, signOutLoading, signOutError] = useSignOut(auth)

  if (authState) {
    const displayName = authState.displayName || authState.email || 'Firebase user'
    return (
      <section className='py-4'>
        <div className='d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4'>
          <div className='mb-3 mb-md-0'>
            <h2 className='h4 mb-2'>{title}</h2>
          </div>
          <div className='d-flex align-items-center'>
            {authState.photoURL && (
              <img
                src={authState.photoURL}
                alt={`Portrait of ${displayName}`}
                className='rounded-circle border border-primary shadow-sm me-3'
                style={{ width: '3rem', height: '3rem', objectFit: 'cover' }}
              />
            )}
            <div>
              <div className='fw-bold'>{displayName}</div>
              <button
                type='button'
                className='btn btn-link p-0 align-baseline text-primary'
                onClick={() => signOut()}
                disabled={signOutLoading}
              >
                {signOutLoading ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
        {signOutError && (
          <div className='alert alert-danger' role='alert'>
            <h4 className='alert-heading'>Sign out Failed</h4>
            <p className='mb-0'>{signOutError.message}</p>
          </div>
        )}
        {children}
      </section>
    )
  }

  const headingTitle = authStateLoading ? title : 'Sign in'
  const headingMessage = authStateLoading
    ? 'Please wait...'
    : 'You must be signed in to view this page.'

  return (
    <section className='py-4'>
      <div className='mb-4'>
        <h2 className='h4 mb-2'>{headingTitle}</h2>
        <p className='mb-0 text-muted'>{headingMessage}</p>
      </div>
      {authStateError && (
        <div className='alert alert-danger' role='alert'>
          <h4 className='alert-heading'>Login State Failure</h4>
          <p className='mb-0'>{authStateError.message}</p>
        </div>
      )}
      {signInError && (
        <div className='alert alert-danger' role='alert'>
          <h4 className='alert-heading'>Login Failed</h4>
          <p className='mb-0'>{signInError.message}</p>
        </div>
      )}
      {!authStateLoading && (
        <button
          type='button'
          className='btn btn-primary d-inline-flex align-items-center'
          onClick={() => signIn()}
          disabled={signInLoading}
        >
          <span className='me-2 fw-bold' aria-hidden='true'>
            G
          </span>
          {signInLoading ? 'Please wait...' : 'Sign in with Google'}
        </button>
      )}
    </section>
  )
}

export default AuthGuard
