
export const config = {}

export default function handler(req, res) {
  res.status(200).json({ hello: `world` });
}
