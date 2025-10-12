import React from 'react'
import { graphql } from 'gatsby'
import { GatsbyImage } from 'gatsby-plugin-image'
import Layout from '../components/layout'

const AboutDeferTemplate = ({ data: { site } }) => (
  <Layout title='About (Defer)'>
    <div>
      <h2>{site.siteMetadata.title} / John Doe</h2>
      <p>
        Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget
        dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes,
        nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis,
        sem. Nulla consequat massa quis enim.
      </p>
    </div>
  </Layout>
)

export const Head = () => (
  <>
    <title>About DSG</title>
    <meta name="robots" content="none" />
  </>
)

export const query = graphql`
  query AboutDefer {
    site {
      siteMetadata {
        title
      }
    }
  }
`

export default AboutDeferTemplate
