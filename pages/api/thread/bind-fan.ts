// pages/api/thread/bind-fan.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { verifyDetachedSig, extractTs } from '../../../lib/verify';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { threadId, pubkeyBase58, msg, sigBase58 } = req.body || {};
  if (!threadId || !pubkeyBase58 || !msg || !sigBase58) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const expectedPrefix = `ROR|bind-fan|thread=${threadId}|fan=${pubkeyBase58}|ts=`;
  if (!msg.startsWith(expectedPrefix)) return res.status(400).json({ error: 'Invalid payload' });

  const ts = extractTs(msg);
  if (!ts || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Expired/invalid timestamp' });
  }
  if (!verifyDetachedSig(msg, sigBase58, pubkeyBase58)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const db = readDB();
  const th = db.threads[threadId];
  if (!th) return res.status(404).json({ error: 'Thread not found' });

  // Nur erlauben, wenn bisher keine Fan-Wallet gebunden ist
  if (th.fan_pubkey && th.fan_pubkey !== pubkeyBase58) {
    return res.status(409).json({ error: 'Thread already bound to another wallet' });
  }

  th.fan_pubkey = pubkeyBase58;
  th.boundAt = Date.now();
  writeDB(db);

  return res.json({ ok: true });
}
