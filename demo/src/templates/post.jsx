import { graphql } from 'gatsby'
import { Link } from 'gatsby-plugin-advanced-pages'
import { PageLayout, PageHead } from '../components'

const Post = ({ data: { post } }) => (
  <PageLayout title={post.frontmatter.title}>
    <div className='mb-4 text-muted'>
      <p className='lead'>
        Generated from Markdown{' '}
        {post.frontmatter.slug.toLowerCase().includes('defer')
          ? 'on demand using DSG'
          : 'during Gatsby build'}{' '}
        and served as a static page.
      </p>
      <div>
        {post.frontmatter.tags.map((tag) => (
          <Link key={tag} to='blog.tag' params={{ tag }}>
            <span className='badge text-bg-primary me-2 p-2'>{tag}</span>
          </Link>
        ))}
      </div>
    </div>
    <div dangerouslySetInnerHTML={{ __html: post.html }} className='content' />
    <div className='mt-4'>
      <Link to='blog'>← Back to all posts</Link>
    </div>
  </PageLayout>
)

export const Head = ({ data }) => <PageHead title={data.post.frontmatter.title} />

export const query = graphql`
  query Post($id: String!, $post: String!) {
    page(id: { eq: $id }) {
      title
    }
    post: markdownRemark(frontmatter: { slug: { eq: $post } }) {
      html
      frontmatter {
        title
        slug
        tags
      }
    }
  }
`

export default Post
