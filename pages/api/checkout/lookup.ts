// pages/api/checkout/lookup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sid = req.query.sid as string;
  if (!sid) return res.status(400).json({ error: 'Missing sid' });

  const db = await readDB();                 // <- async!
  const checkouts = (db as any).checkouts || {};
  const hit = checkouts[sid];

  if (!hit) return res.status(404).json({ error: 'Not found' });
  return res.json(hit);
}
