import React from 'react'
import { Link } from 'gatsby-plugin-advanced-pages'
import './layout.css'

const menu = [
  { title: 'Home', route: 'home' },
  { title: 'Blog', route: 'blog' },
  { title: 'SSR', route: '/ssr' },
  { title: 'About', route: 'about' },
  { title: 'About (DSG)', route: '/about-defer' },
]

const Layout = ({ title, children }) => (
  <div className='container'>
    <header className='py-3'>
      <nav className='navbar navbar-expand navbar-dark bg-dark rounded'>
        <Link id="avatar" className='navbar-brand' to='home' />
        <ul className='navbar-nav'>
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
      </nav>
    </header>
    <main className='p-5 bg-light'>
      <div className='mb-4 pb-2 border-bottom'>
        <h1>{title}</h1>
      </div>
      <div>{children}</div>
    </main>
    <footer className='text-muted my-5'>
      © {new Date().getFullYear()},{` Built with `}
      <a href='https://www.gatsbyjs.org'>Gatsby</a>
      {` and `}
      <a href='https://github.com/mohatt/gatsby-plugin-advanced-pages'>Gatsby Advanced Pages</a>
    </footer>
  </div>
)

export default Layout
