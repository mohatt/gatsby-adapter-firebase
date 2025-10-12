import React from 'react'
import { graphql, Script } from 'gatsby'
import Layout from '../components/layout'
import avatarAlt from '../images/avatar-smile.png'

const HomeTemplate = ({ data }) => (
  <Layout title={data.page.title}>
    <div>
      <meta name="robots" content="all" />
      This is a simple blog site built with <a href='https://www.gatsbyjs.org'>Gatsby</a> and{' '}
      <a href='https://github.com/mohatt/gatsby-plugin-advanced-pages'>Gatsby Advanced Pages</a>{' '}
      plugin.
    </div>
    <Script id="home-script">
      {`
      (function (){
        let currDate = new Date();
        let unused = 'foo';
        
        console.log('Gatsby Body Script', currDate, 8+2);
      })()
      `}
    </Script>
  </Layout>
)

export const Head = () => (
  <>
    <title>HomePage</title>
    <meta name="robots" content="noindex" />
    <link rel="prefetch" as="image" href={avatarAlt} />
    <Script id="home-head-script">
      {`
      (function (){
        let currDate = new Date();
        let unused = 'foo';
        
        console.log('Gatsby Head Script', currDate, 6+2);
      })()
      `}
    </Script>
  </>
)

export const query = graphql`
  query Page($id: String!) {
    page(id: { eq: $id }) {
      title
    }
  }
`

export default HomeTemplate
