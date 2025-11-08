// pages/api/creator-authz.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import * as Verify from '../../lib/verify';

const DRIFT_MS = 5 * 60 * 1000; // ±5 Minuten

async function verifyAuthHeader(msg?: string, sigBase58?: string, pubkeyBase58?: string) {
  if (!msg || !sigBase58 || !pubkeyBase58) return false;
  if (!String(msg).startsWith('ROR|auth|')) return false;

  // ts aus msg extrahieren
  const tsPart = String(msg).split('|').find(p => p.startsWith('ts='));
  const ts = Number(tsPart?.split('ts=').pop());
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DRIFT_MS) return false;

  // flexible verify-Funktion suchen (verschiedene Exportvarianten abdecken)
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
      // weiter testen
    }
  }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const handle = String(req.query.handle || '').trim();
    if (!handle) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });

    const walletHeader = req.headers['x-wallet'];
    const msgHeader = req.headers['x-msg'] as string | undefined;
    const sigHeader = req.headers['x-sig'] as string | undefined;

    const db = await readDB();
    const creator = db.creators?.[handle];

    if (!creator?.wallet) {
      // Kein gebundenes Wallet: als nicht autorisiert behandeln (kein Leak)
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    // Header prüfen
    const authed = await verifyAuthHeader(msgHeader, sigHeader, String(walletHeader || ''));
    if (!authed) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    // Wallet muss exakt matchen
    if (String(walletHeader) !== String(creator.wallet)) {
      return res.status(403).json({ ok: false, error: 'WALLET_MISMATCH' });
    }

    return res.status(200).json({ ok: true, handle, wallet: creator.wallet });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
