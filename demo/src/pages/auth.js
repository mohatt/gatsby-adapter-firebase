import React from 'react'
import { graphql } from 'gatsby'
import Layout from '../components/layout'
import AuthGuard from '../firebase/AuthGuard'

const DsgTemplate = () => (
  <Layout title='Authenticated Page'>
    <AuthGuard>test</AuthGuard>
  </Layout>
)

export const Head = ({ data }) => (
  <>
    <title>Auth</title>
    <meta name='description' content={data.site.siteMetadata.description} />
  </>
)

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

export default DsgTemplate
