// pages/api/creator-session/start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { signSession, setSessionCookie, type CreatorSession } from '../../../lib/session';

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

    const walletHeader = String(req.headers['x-wallet'] || '').trim();
    if (!walletHeader) {
      return res.status(400).json({ ok: false, error: 'MISSING_WALLET_HEADER' });
    }

    const db = await readDB();
    const creator = db.creators?.[h];

    if (!creator) {
      // kein Creator mit diesem Handle
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    let dbWallet = String(creator.wallet || '').trim();

    // 🩹 Auto-Bind: wenn noch keine Wallet gesetzt ist, binden wir jetzt die aktuelle Wallet
    if (!dbWallet) {
      creator.wallet = walletHeader;
      dbWallet = walletHeader;
      await writeDB(db);
    } else if (dbWallet !== walletHeader) {
      // es gibt schon eine gebundene Wallet und sie stimmt NICHT überein
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
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
