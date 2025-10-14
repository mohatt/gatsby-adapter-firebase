export default function handler(req, res) {
  res.status(200).json({ data: ['hello', `world`] })
}

export const config = {
  bodyParser: {
    json: {
      limit: `10mb`,
    },
  },
}
