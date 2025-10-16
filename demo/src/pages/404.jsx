import { PageHead, PageLayout } from '../components'

const NotFound = () => (
  <PageLayout title='Page not found'>
    <div>You just hit a route that doesn't exist.</div>
  </PageLayout>
)

export const Head = () => <PageHead title='Page not found' />

export default NotFound
