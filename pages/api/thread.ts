// pages/api/thread.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = (req.query.id as string) || '';
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // Lazy-Expiry: falls abgelaufen -> sofort refunded markieren
  try { await touchExpiryForThread(id); } catch {}

  const db = await readDB();
  const thread = db.threads?.[id] || null;
  const messages = db.messages?.[id] || [];
  return res.json({ thread, messages });
}
