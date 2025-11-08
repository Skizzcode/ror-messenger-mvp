// pages/api/creator-by-wallet.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    const wallet = String(req.query.wallet || '').trim();
    if (!wallet) return res.status(400).json({ ok: false, error: 'MISSING_WALLET' });

    const db = await readDB();
    const creators = Object.values<any>(db.creators || {});
    const found = creators.find((c: any) => c.wallet && c.wallet === wallet);

    if (!found) return res.status(200).json({ ok: false });
    return res.status(200).json({
      ok: true,
      handle: found.handle,
      displayName: found.displayName || found.handle,
      avatarDataUrl: found.avatarDataUrl || null,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e?.message });
  }
}
