import React from 'react'

export const onRenderBody = ({ setHeadComponents }) => {
  setHeadComponents([
    <link key='bs-preload' rel='preload' href='/bootstrap.min.css' as='style' />,
    <link key='bs' rel='stylesheet' href='/bootstrap.min.css' />,
  ])
}
