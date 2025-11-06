// pages/api/creator-available.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = String(req.query.handle || '').trim().toLowerCase();

  // gleiche Regeln wie beim Claim
  const valid = /^[a-z0-9\-_.]{3,24}$/.test(raw);
  if (!valid) return res.json({ available: false, reason: 'invalid' });

  const db = await readDB();
  const taken = !!db.creators?.[raw]?.wallet; // belegt, wenn Wallet gebunden
  return res.json({ available: !taken });
}
