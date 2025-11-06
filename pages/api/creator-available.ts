// pages/api/creator-available.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = (req.query.handle as string | undefined) || '';
  const handle = raw.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
  if (!handle || handle.length < 2) {
    return res.status(200).json({ available: false, reason: 'invalid' });
  }
  const db = await readDB();
  const exists = !!db.creators?.[handle];
  return res.status(200).json({ available: !exists });
}
