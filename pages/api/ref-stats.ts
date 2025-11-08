// pages/api/ref-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import * as Verify from '../../lib/verify';

const DRIFT_MS = 5 * 60 * 1000;

// flexible Verify (passt sich an eure lib/verify Exporte an)
async function verifySig(params: { msg: string; sigBase58: string; pubkeyBase58: string }) {
  const v: any = Verify;
  const cands = [
    v.verifyServerSignature,
    v.verifySignature,
    v.verify,
    v.default?.verifyServerSignature,
    v.default?.verifySignature,
    v.default?.verify,
  ].filter((fn) => typeof fn === 'function');
  for (const fn of cands) {
    const ok = await fn(params);
    if (typeof ok === 'boolean') return ok;
  }
  throw new Error('VERIFY_FN_NOT_FOUND');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });

  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).json({ ok:false, error:'MISSING_CODE' });

    // --- Auth-Header (wallet-gated) ---
    const wallet = String(req.headers['x-wallet'] || '');
    const msg = String(req.headers['x-msg'] || '');
    const sig = String(req.headers['x-sig'] || '');
    if (!wallet || !msg || !sig) {
      return res.status(401).json({ ok:false, error:'MISSING_HEADERS' });
    }
    if (!msg.startsWith('ROR|auth|wallet=')) {
      return res.status(400).json({ ok:false, error:'BAD_PREFIX' });
    }
    const ts = Number(msg.split('ts=').pop());
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DRIFT_MS) {
      return res.status(400).json({ ok:false, error:'TS_DRIFT' });
    }
    const ok = await verifySig({ msg, sigBase58: sig, pubkeyBase58: wallet });
    if (!ok) return res.status(401).json({ ok:false, error:'BAD_SIGNATURE' });

    // --- Daten lesen ---
    const db = await readDB();

    // Inhaber des refCodes finden
    const creators: any = db.creators || {};
    const owner = Object.values<any>(creators).find((c) => c.refCode === code);
    if (!owner) return res.status(404).json({ ok:false, error:'REFCODE_NOT_FOUND' });

    // Gate: Wallet muss zum Besitzer gehören (falls hinterlegt)
    if (owner.wallet && owner.wallet !== wallet) {
      return res.status(401).json({ ok:false, error:'WALLET_MISMATCH' });
    }

    // Liste der Creator, die über diesen Code kamen
    const referredCreators = Object.values<any>(creators).filter((c) => c.referredBy === code);

    // GMV/Stats: Scanne Threads jener Creator
    const allThreads = Object.values<any>(db.threads || {});
    let revenueAll = 0;
    let revenueAnswered = 0;
    for (const t of allThreads) {
      if (referredCreators.some((rc) => rc.handle === t.creator)) {
        revenueAll += t.amount || 0;
        if (t.status === 'answered') revenueAnswered += t.amount || 0;
      }
    }

    // Response für Dashboard
    return res.status(200).json({
      ok: true,
      creatorsCount: referredCreators.length,
      creators: referredCreators
        .sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0))
        .map((c)=>({ handle: c.handle, displayName: c.displayName || c.handle })),
      totals: {
        revenueAll,
        revenueAnswered,
      },
    });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error:'SERVER_ERROR', detail: e?.message });
  }
}
