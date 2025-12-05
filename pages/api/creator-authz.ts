// pages/api/creator-authz.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';
import { isAdminWallet } from '../../lib/admin';

/**
 * Returns { ok: true } only if:
 * - creator exists
 * - creator has a bound wallet
 * - request is authenticated (session cookie or signed headers) for that wallet
 *
 * Otherwise responds with 401/403/404 and ok: false.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const rawHandle = String(req.query.handle || '').trim().toLowerCase();
    if (!rawHandle) {
      return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });
    }

    const db = await readDB();
    const creator = (db.creators || {})[rawHandle];
    if (!creator) {
      return res.status(404).json({ ok: false, error: 'CREATOR_NOT_FOUND' });
    }
    if (creator.banned) {
      return res.status(403).json({ ok: false, error: 'CREATOR_BANNED' });
    }

    if (!creator.wallet) {
      return res.status(403).json({ ok: false, error: 'CREATOR_WALLET_NOT_SET' });
    }

    const auth = await checkRequestAuth(req);
    if (!auth.ok || !auth.wallet) {
      return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
    }
    if (creator.wallet !== auth.wallet) {
      return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
    }
    if (auth.viaSessionHandle && auth.viaSessionHandle !== rawHandle) {
      return res.status(403).json({ ok: false, error: 'SESSION_HANDLE_MISMATCH' });
    }
    const adminBypass = isAdminWallet(auth.wallet);
    if (!creator.emailVerified && !adminBypass) {
      return res.status(403).json({ ok: false, error: 'EMAIL_NOT_VERIFIED', needsVerification: true });
    }

    return res.status(200).json({
      ok: true,
      handle: creator.handle,
      wallet: creator.wallet,
      adminBypass,
      via: 'wallet-session',
    });
  } catch (e: any) {
    console.error('creator-authz error', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
