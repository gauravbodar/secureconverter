import { setCors } from './middleware/corsHeaders.js';

export default function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
