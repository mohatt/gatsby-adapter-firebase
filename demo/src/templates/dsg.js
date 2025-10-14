import React from 'react'
import { graphql } from 'gatsby'
import Layout from '../components/layout'

const DsgTemplate = () => (
  <Layout title='Deferred static generation'>
    <div>
      <p className='lead'>
        This page opts into Gatsby&apos;s Deferred Static Generation (DSG). When you hit it for the first time,
        it renders on demand with Cloud Functions, caches the
        result to Firebase Storage, and serves the cached HTML on subsequent visits.
      </p>
      <p>
        DSG is ideal when you have a large collection of pages that rarely change: docs, catalogs,
        long-tail marketing pages, or product detail views. Instead of waiting for everything at
        build time, you generate pages lazily the first time a visitor needs them.
      </p>
      <ul className='pl-3'>
        <li className='mb-2'>
          <strong>Config:</strong> mark the route in <code>gatsby-node.js</code> using the{' '}
          <code>defer</code> option.
        </li>
        <li className='mb-2'>
          <strong>Caching:</strong> the adapter pushes the rendered HTML to Hosting so future
          visitors see CDN-speed responses.
        </li>
        <li className='mb-0'>
          <strong>Freshness:</strong> redeploy to invalidate the cache, or clear the cache manually from Firebase Storage Dashboard.
        </li>
      </ul>
      <p className='small text-muted mb-0'>
        Tip: Combine DSG with Firebase Hosting preview channels to test new content without warming
        production caches.
      </p>
    </div>
  </Layout>
)

export const Head = ({ data }) => (
  <>
    <title>Deferred static generation</title>
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

export default DsgTemplate
