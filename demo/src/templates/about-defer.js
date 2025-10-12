import React from 'react'
import { graphql } from 'gatsby'
import { GatsbyImage } from 'gatsby-plugin-image'
import Layout from '../components/layout'

const AboutDeferTemplate = ({ data: { avatar } }) => (
  <Layout title='About (Defer)'>
    <div className='row'>
      <div className='col-md-3'>
        <GatsbyImage image={avatar.childImageSharp.image} alt='Avatar Image' className='about-avatar' />
      </div>
      <div className='col-md-9'>
        <div>
          <h2>John Doe</h2>
          <p>
            Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget
            dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes,
            nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis,
            sem. Nulla consequat massa quis enim.
          </p>
        </div>
      </div>
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
    avatar: file(relativePath: { eq: "images/avatar.png" }) {
      childImageSharp {
        image: gatsbyImageData(height: 400, placeholder: BLURRED)
      }
    }
  }
`

export default AboutDeferTemplate
