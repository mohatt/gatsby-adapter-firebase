import React from 'react'

export const onRenderBody = ({ setHeadComponents }) => {
  const gaId = process.env.NODE_ENV === 'production' ? 'G-ESWXNMGCWX' : 'G-XXXXXXXXXX'
  const renderHtml = () => `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}');
  `

  setHeadComponents([
    <link key='bs' rel='stylesheet' href='/bootstrap.min.css' />,
    <script key='gtag' async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />,
    <script key='gtag-config' dangerouslySetInnerHTML={{ __html: renderHtml() }} />,
  ])
}
