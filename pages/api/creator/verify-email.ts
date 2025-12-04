// pages/api/creator/verify-email.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { handle, code } = (req.body || {}) as { handle?: string; code?: string };
  const cleanHandle = String(handle || '').trim().toLowerCase();
  if (!cleanHandle || !code) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });

  const auth = await checkRequestAuth(req, { allowCookie: true });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });

  const db = await readDB();
  const creator = (db.creators || {})[cleanHandle];
  if (!creator) return res.status(404).json({ ok: false, error: 'CREATOR_NOT_FOUND' });
  if (!creator.wallet || creator.wallet !== auth.wallet) return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });

  if (creator.emailVerified) return res.status(200).json({ ok: true, already: true });
  if (!creator.emailCode || String(creator.emailCode) !== String(code)) {
    return res.status(400).json({ ok: false, error: 'INVALID_CODE' });
  }

  creator.emailVerified = true;
  creator.emailCode = null;
  await writeDB(db);
  return res.status(200).json({ ok: true, verified: true });
}
