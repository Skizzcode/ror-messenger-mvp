// pages/api/creator-by-wallet.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const wallet = String(req.query.wallet || '').trim();
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });

  const db = await readDB();
  const creators = db.creators || {};

  for (const [handle, c] of Object.entries<any>(creators)) {
    if (c?.wallet && c.wallet === wallet) {
      return res.json({
        ok: true,
        handle,
        displayName: c.displayName || handle,
        avatarDataUrl: c.avatarDataUrl || null,
      });
    }
  }

  return res.json({ ok: false, handle: null });
}
