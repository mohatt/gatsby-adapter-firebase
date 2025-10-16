import { useSiteMetadata } from '../hooks/useSiteMetadata'

const PageHead = ({ title, description, children }) => {
  const metadata = useSiteMetadata()
  const seoTitle = title ? `${title} — ${metadata.title}` : metadata.title
  const seoDescription = description || metadata.description

  return (
    <>
      <html lang='en' />
      <title>{seoTitle}</title>
      <meta name='description' content={seoDescription} />
      <meta property='og:title' content={seoTitle} />
      <meta property='og:description' content={seoDescription} />
      <meta property='og:type' content='website' />
      {children}
    </>
  )
}

export default PageHead
