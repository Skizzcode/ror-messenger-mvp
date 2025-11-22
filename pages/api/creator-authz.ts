// pages/api/creator-authz.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import * as Verify from '../../lib/verify';
import { COOKIE_NAME, verifySession } from '../../lib/session';

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
      /* next */
    }
  }
  return false;
}

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + '=')) return p.slice(name.length + 1);
  }
  return null;
}

const normalizeWallet = (s?: string | null) => (s || '').trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // 🔑 Handle genauso normalisieren wie in creator-settings
    const handle = String(req.query.handle || '').trim().toLowerCase();
    if (!handle) {
      return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });
    }

    const db = await readDB();
    const creator = db.creators?.[handle];

    const dbWallet = normalizeWallet((creator as any)?.wallet ?? null);
    if (!creator || !dbWallet) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    // 1) Versuch: Session-Cookie
    const token = readCookie(req, COOKIE_NAME);
    if (token) {
      const v = verifySession(token);
      const sessionWallet = normalizeWallet((v.payload as any)?.wallet ?? null);
      if (v.ok && v.payload?.handle === handle && sessionWallet === dbWallet) {
        return res.status(200).json({ ok: true, handle, wallet: dbWallet, via: 'cookie' });
      }
      // invalid cookie → bewusst kein Hard-Fail; wir versuchen Header-Fallback
    }

    // 2) Fallback: Kurzzeit-Header
    const walletHeader = normalizeWallet(String(req.headers['x-wallet'] || ''));
    const msgHeader = req.headers['x-msg'] as string | undefined;
    const sigHeader = req.headers['x-sig'] as string | undefined;

    const authed = await verifyHeader(msgHeader, sigHeader, walletHeader);
    if (!authed) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    if (walletHeader !== dbWallet) {
      return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
    }

    return res.status(200).json({ ok: true, handle, wallet: dbWallet, via: 'header' });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
