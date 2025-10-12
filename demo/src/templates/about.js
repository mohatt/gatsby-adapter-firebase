import React from 'react'
import { graphql } from 'gatsby'
import { GatsbyImage } from 'gatsby-plugin-image'
import Layout from '../components/layout'

const AboutTemplate = ({ data: { page, avatar } }) => (
  <Layout title={page.title}>
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
        <h3 className='mt-4'>Skills</h3>
        {page.data.skills.map((skill) => (
          <label key={skill} className='badge-pill badge-primary mr-2'>
            {skill}
          </label>
        ))}
      </div>
    </div>
  </Layout>
)

export const Head = () => (
  <>
    <title>About Us</title>
    <meta name="robots" content="all" />
    <link as="font" href="/static/test-font.woff2" rel="preload" />
  </>
)

export const query = graphql`
  query About($id: String!) {
    page(id: { eq: $id }) {
      title
      data
    }
    avatar: file(relativePath: { eq: "images/avatar.png" }) {
      childImageSharp {
        image: gatsbyImageData(height: 400, placeholder: BLURRED)
      }
    }
  }
`

export default AboutTemplate
