// pages/api/admin/ban.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { handle, banned } = (req.body || {}) as { handle?: string; banned?: boolean };
  const cleanHandle = String(handle || '').trim().toLowerCase();
  if (!cleanHandle) return res.status(400).json({ ok: false, error: 'BAD_HANDLE' });

  const auth = await checkRequestAuth(req);
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  if (!isAdminWallet(auth.wallet)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const db = await readDB();
  const creator = (db.creators || {})[cleanHandle];
  if (!creator) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

  creator.banned = !!banned;
  await writeDB(db);
  return res.status(200).json({ ok: true, handle: cleanHandle, banned: creator.banned });
}
