import React from 'react'
import { Link } from 'gatsby-plugin-advanced-pages'
import './layout.css'

const menu = [
  { title: 'Home', route: 'home' },
  { title: 'SSR', route: '/ssr' },
  { title: 'DSG', route: '/dsg' },
  { title: 'Auth', route: '/auth' },
  { title: 'Blog', route: 'blog' },
]

const Layout = ({ title, children }) => (
  <div className='container'>
    <header className='py-3'>
      <nav className='navbar navbar-expand navbar-light bg-light rounded'>
        <Link id='avatar' className='navbar-brand' to='home' />
        <ul className='navbar-nav me-auto'>
          {menu.map((link) => (
            <li key={link.title} className='nav-item'>
              <Link
                activeClassName='active'
                className='nav-link'
                to={link.route}
                partiallyActive={link.route !== 'home'}
              >
                {link.title}
              </Link>
            </li>
          ))}
        </ul>
        <span className='navbar-brand mb-0'>Gatsby Adapter for Firebase</span>
      </nav>
    </header>
    <main className='p-5 bg-light'>
      {title && (
        <div className='mb-4 pb-2 border-bottom'>
          <h1 className='h3'>{title}</h1>
        </div>
      )}
      <div>{children}</div>
    </main>
    <footer className='text-muted mt-4 mb-5'>
      <span>
        Brewed with{' '}
        <a href='https://www.gatsbyjs.com' className='link' target='_blank' rel='noreferrer'>
          Gatsby
        </a>{' '}
        &{' '}
      </span>
      <svg className='ms-1 align-bottom' width={26} height={26} viewBox='0 0 24 24'>
        <path d='M23.566 12.004c-.468-.867-1.27-1.496-2.253-1.774a3.693 3.693 0 0 0-2.707.262c0-.27 0-.523-.004-.758v-.41c0-.36-.29-.648-.649-.648H.653c-.36 0-.65.289-.65.648 0 .13 0 .266-.003.41-.012 2.532-.04 7.246 4.121 12.172.125.145.305.23.496.23h9.367a.65.65 0 0 0 .496-.23c.391-.46.743-.922 1.063-1.375.855-.129 6.91-1.203 8.27-5.574.316-1.027.23-2.074-.247-2.953ZM4.922 20.836C1.372 16.5 1.285 12.48 1.297 9.973h16.012c.007 2.507-.079 6.527-3.625 10.863Zm17.652-6.266c-.855 2.746-4.226 3.961-6.07 4.434 1.437-2.574 1.894-4.973 2.039-6.883a2.439 2.439 0 0 1 2.418-.644c.644.183 1.164.59 1.465 1.144.312.578.363 1.25.148 1.95ZM5.898 6.648a.65.65 0 0 0 1.297 0c0-.199.032-.27.098-.414.098-.199.227-.472.227-.964 0-.489-.13-.766-.227-.965a.783.783 0 0 1-.098-.414c0-.2.032-.27.098-.41.098-.204.227-.477.227-.97a.65.65 0 0 0-1.297 0c0 .204-.036.274-.102.415-.094.203-.223.476-.223.965 0 .492.13.765.223.964.066.145.102.215.102.415 0 .199-.035.273-.102.414a2.04 2.04 0 0 0-.223.964ZM8.492 6.648c0 .36.29.649.649.649.359 0 .648-.29.648-.649 0-.199.035-.27.102-.414.093-.199.222-.472.222-.964a2.04 2.04 0 0 0-.222-.965c-.067-.14-.102-.215-.102-.414 0-.2.035-.27.102-.41.093-.204.222-.477.222-.97a.65.65 0 0 0-1.297 0c0 .204-.035.274-.101.415-.094.203-.223.476-.223.965 0 .492.13.765.223.964.066.145.101.215.101.415 0 .199-.035.273-.101.414a2.04 2.04 0 0 0-.223.964ZM11.086 6.648c0 .36.289.649.648.649.36 0 .649-.29.649-.649 0-.199.035-.27.101-.414.094-.199.223-.472.223-.964a2.04 2.04 0 0 0-.223-.965c-.066-.14-.101-.215-.101-.414 0-.2.035-.27.101-.41.094-.204.223-.477.223-.97a.65.65 0 0 0-1.297 0c0 .204-.035.274-.101.415-.094.203-.223.476-.223.965 0 .492.129.765.223.964.066.145.101.215.101.415 0 .199-.035.273-.101.414a2.04 2.04 0 0 0-.223.964Zm0 0'></path>
      </svg>
    </footer>
  </div>
)

export default Layout
