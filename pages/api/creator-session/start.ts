// pages/api/creator-session/start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';
import * as Verify from '../../../lib/verify';
import { signSession, setSessionCookie, type CreatorSession } from '../../../lib/session';

const DRIFT_MS = 5 * 60 * 1000; // ±5 Minuten

async function verifyHeader(msg?: string, sigBase58?: string, pubkeyBase58?: string) {
  if (!msg || !sigBase58 || !pubkeyBase58) return false;
  if (!String(msg).startsWith('ROR|auth|')) return false;
  const tsPart = String(msg).split('|').find((p) => p.startsWith('ts='));
  const ts = Number(tsPart?.split('ts=').pop());
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DRIFT_MS) return false;

  const v: any = Verify;
  const candidates = [
    v.verifyServerSignature,
    v.verifySignature,
    v.verify,
    v.default?.verifyServerSignature,
    v.default?.verifySignature,
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

const normalizeWallet = (s?: string | null) => (s || '').trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { handle } = req.query;
    // 🔑 Handle genauso normalisieren wie beim Speichern
    const h = String(handle || '').trim().toLowerCase();
    if (!h) {
      return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });
    }

    const walletHeader = normalizeWallet(String(req.headers['x-wallet'] || ''));
    const msgHeader = req.headers['x-msg'] as string | undefined;
    const sigHeader = req.headers['x-sig'] as string | undefined;

    const db = await readDB();
    const creator = db.creators?.[h];

    const dbWallet = normalizeWallet((creator as any)?.wallet ?? null);
    if (!creator || !dbWallet) {
      // kein Creator oder kein gebundenes Wallet → keine Session
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    const authed = await verifyHeader(msgHeader, sigHeader, walletHeader);
    if (!authed) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    if (walletHeader !== dbWallet) {
      return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
    }

    // 60 Minuten Session
    const now = Date.now();
    const payload: CreatorSession = {
      v: 1,
      wallet: dbWallet,
      handle: h,
      iat: now,
      exp: now + 60 * 60 * 1000,
    };
    const token = signSession(payload);
    setSessionCookie(res, token, 60 * 60);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
