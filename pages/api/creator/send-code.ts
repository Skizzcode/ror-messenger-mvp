// pages/api/creator/send-code.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { sendVerificationEmail } from '../../../lib/mail';
import { uid } from '../../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { handle } = (req.body || {}) as { handle?: string };
  const cleanHandle = String(handle || '').trim().toLowerCase();
  if (!cleanHandle) return res.status(400).json({ ok: false, error: 'BAD_HANDLE' });

  const auth = await checkRequestAuth(req);
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });

  const db = await readDB();
  const creator = (db.creators || {})[cleanHandle];
  if (!creator) return res.status(404).json({ ok: false, error: 'CREATOR_NOT_FOUND' });
  if (!creator.wallet || creator.wallet !== auth.wallet) return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
  if (!creator.email) return res.status(400).json({ ok: false, error: 'EMAIL_MISSING' });

  creator.emailCode = uid();
  creator.emailVerified = false;
  await writeDB(db);

  await sendVerificationEmail(cleanHandle, creator.email, creator.emailCode);

  return res.status(200).json({ ok: true, sent: true });
}
