// pages/api/checkout/lookup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { sid } = req.query;
  if (!sid || typeof sid !== 'string') return res.status(400).json({ error: 'Missing sid' });
  const db = readDB();
  const hit = db.checkouts?.[sid];
  if (!hit) return res.status(404).json({ error: 'Not found' });
  return res.json(hit);
}
