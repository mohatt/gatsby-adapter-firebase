import { graphql } from 'gatsby'
import { Link, Pagination } from 'gatsby-plugin-advanced-pages'
import { PageHead, PageLayout } from '../components'

const Blog = ({ data, pageContext }) => {
  const { page, feed, tags } = data
  const { tag } = pageContext

  let title = page.title
  let route = 'blog'
  let params = {}
  if (tag) {
    route = 'blog.tag'
    params = { tag }
    title += ` / ${tag}`
  }

  if (feed.pageInfo.currentPage > 1) {
    title += ` (Page ${feed.pageInfo.currentPage})`
  }

  return (
    <PageLayout title={title}>
      <section className='mb-4'>
        <p className='lead'>
          These posts are sourced from Markdown files under <code>content/blog</code>, transformed
          at build time.
        </p>
      </section>
      <section className='row'>
        <div className='col-md-9'>
          {feed.edges.map(({ node }) => (
            <div key={node.frontmatter.slug} className='card mb-4'>
              <div className='card-body'>
                <h3 className='card-title h4'>{node.frontmatter.title}</h3>
                <p className='card-text'>{node.excerpt}</p>
                <Link to='blog.post' params={{ post: node.frontmatter.slug }}>
                  Read the article →
                </Link>
              </div>
              <div className='card-footer text-muted'>
                Served as static HTML • Tags:{' '}
                {node.frontmatter.tags ? node.frontmatter.tags.join(', ') : 'none'}
              </div>
            </div>
          ))}
        </div>
        <div className='col-md-3'>
          <div className='card mb-4'>
            <h5 className='card-header'>Tags</h5>
            <div className='card-body'>
              <ul className='list-unstyled mb-0'>
                {tags.group.map(({ fieldValue, totalCount }) => (
                  <li key={fieldValue} className='mb-2'>
                    <Link to='blog.tag' params={{ tag: fieldValue }}>
                      {fieldValue}{' '}
                      <label className='badge rounded-pill text-bg-primary'>{totalCount}</label>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
      <Pagination route={route} params={params} pageInfo={feed.pageInfo} ui='simple' />
    </PageLayout>
  )
}

export const Head = ({ data }) => <PageHead title={data.page.title} />

export const query = graphql`
  query Blog($id: String!, $limit: Int!, $offset: Int!, $filter: MarkdownRemarkFilterInput!) {
    page(id: { eq: $id }) {
      title
    }
    feed: allMarkdownRemark(limit: $limit, skip: $offset, filter: $filter) {
      edges {
        node {
          excerpt(pruneLength: 200)
          frontmatter {
            title
            slug
            tags
          }
        }
      }
      pageInfo {
        ...Pagination
      }
    }
    tags: allMarkdownRemark {
      group(field: { frontmatter: { tags: SELECT } }) {
        fieldValue
        totalCount
      }
    }
  }
`

export default Blog
