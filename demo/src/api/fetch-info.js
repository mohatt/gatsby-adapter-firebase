export default function handler(req, res) {
  console.log('req.url', req.url)
  console.log('req.query', req.query)
  console.log('req.cookies', req.cookies)
  console.log('req.path', req.path)
  console.log('req.query', req.query)
  res.status(200).json({ data: ['hello', `world`] })
}

export const config = {
  bodyParser: {
    json: {
      limit: `10mb`,
    },
  },
}
