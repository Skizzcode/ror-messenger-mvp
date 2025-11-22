// pages/api/creator-session/start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import * as Verify from '../../../lib/verify';
import { signSession, setSessionCookie, type CreatorSession } from '../../../lib/session';

const DRIFT_MS = 5 * 60 * 1000; // ±5 Minuten

async function verifyHeader(msg?: string, sigBase58?: string, pubkeyBase58?: string) {
  if (!msg || !sigBase58 || !pubkeyBase58) return false;
  if (!String(msg).startsWith('ROR|auth|')) return false;

  const ts = (Verify.extractTs && Verify.extractTs(msg)) ?? null;
  if (!ts || Math.abs(Date.now() - ts) > DRIFT_MS) return false;

  const v: any = Verify;
  const candidates = [
    v.verifyServerSignature,
    v.verifySignature,
    v.verifyDetachedSig,
    v.verify,
    v.default?.verifyServerSignature,
    v.default?.verifySignature,
    v.default?.verifyDetachedSig,
    v.default?.verify,
  ].filter((fn) => typeof fn === 'function');

  for (const fn of candidates) {
    try {
      const ok = await fn({ msg, sigBase58, pubkeyBase58 });
      if (ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

// simple check: sieht der String nach einer Solana-Adresse aus?
function looksLikePubkey(s: string): boolean {
  const v = s.trim();
  // grob: Base58, 32–44 chars
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { handle } = req.query;
    const h = String(handle || '').trim().toLowerCase();
    if (!h) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });

    const walletHeaderRaw = String(req.headers['x-wallet'] || '');
    const walletHeader = walletHeaderRaw.trim();
    const msgHeader = req.headers['x-msg'] as string | undefined;
    const sigHeader = req.headers['x-sig'] as string | undefined;

    const db = await readDB();
    const creator = db.creators?.[h];
    if (!creator) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    const authed = await verifyHeader(msgHeader, sigHeader, walletHeader);
    if (!authed) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    const dbWalletRaw = String(creator.wallet || '');
    const dbWallet = dbWalletRaw.trim();

    // 🔧 Auto-Repair: wenn Wallet in der DB offensichtlich kaputt/placeholder ist,
    // binden wir sie EINMALIG an die korrekt signierende Wallet.
    if (!looksLikePubkey(dbWallet)) {
      creator.wallet = walletHeader;
      await writeDB(db);
    } else if (walletHeader !== dbWallet) {
      return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
    }

    // 60 Minuten Session
    const now = Date.now();
    const payload: CreatorSession = {
      v: 1,
      wallet: walletHeader,
      handle: h,
      iat: now,
      exp: now + 60 * 60 * 1000,
    };
    const token = signSession(payload);
    setSessionCookie(res, token, 60 * 60);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('creator-session/start error', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
