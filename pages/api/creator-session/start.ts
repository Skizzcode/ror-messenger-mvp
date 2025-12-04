// pages/api/creator-session/start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { signSession, setSessionCookie, type CreatorSession } from '../../../lib/session';
import { checkRequestAuth } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { handle } = req.query;
    const h = String(handle || '').trim().toLowerCase();
    if (!h) {
      return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });
    }

    // Require a signed auth header (or valid session cookie) to prove wallet ownership
    const auth = await checkRequestAuth(req);
    if (!auth.ok || !auth.wallet) {
      return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
    }

    const db = await readDB();
    const creator = db.creators?.[h];

    if (!creator) {
      // kein Creator mit diesem Handle
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    let dbWallet = String(creator.wallet || '').trim();

    // No auto-bind here: creator must already be bound via claim/settings
    if (!dbWallet) {
      return res.status(403).json({ ok: false, error: 'CREATOR_WALLET_NOT_SET' });
    }
    if (dbWallet !== auth.wallet) {
      return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
    }

    // 60-Minuten-Session setzen
    const now = Date.now();
    const payload: CreatorSession = {
      v: 1,
      wallet: dbWallet,
      handle: h,
      iat: now,
      exp: now + 60 * 60 * 1000,
    };

    const token = signSession(payload);
    setSessionCookie(res, token, 60 * 60); // 60 Minuten

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('creator-session/start error', e);
    const msg = e?.message || 'SERVER_ERROR';
    return res.status(500).json({ ok: false, error: msg });
  }
}
