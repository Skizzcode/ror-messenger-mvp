// pages/api/message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid } from '../../lib/db';
import { releaseEscrow } from '../../lib/escrow'; // server-side stub
import { basicLimiter } from '../../lib/rate';

function isSubstantial(text: string) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  // at least 30 visible chars & contains at least one letter
  return t.length >= 30 && /[A-Za-z]/.test(t);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // very light ip/thread limiter
  if (!basicLimiter(req, { maxPerMin: 20 })) {
    return res.status(429).json({ error: 'Rate limited' });
  }

  const { threadId, from, body, sigBase58, msg, pubkeyBase58 } = req.body || {};
  if (!threadId || !from || !body) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const db = readDB();
  const th = db.threads?.[threadId];
  if (!th) return res.status(404).json({ error: 'Thread not found' });

  // (Optional) verify message signature fields if present
  if (sigBase58 && msg && pubkeyBase58) {
    // TODO: add strict verify via lib/verify if needed
  }

  const now = Date.now();
  db.messages[threadId] = db.messages[threadId] || [];
  db.messages[threadId].push({
    id: uid(),
    threadId,
    from,
    body,
    ts: now
  });

  // Auto-release if creator sends a substantial answer and thread is open
  if (from === 'creator' && th.status === 'open' && isSubstantial(body)) {
    th.status = 'answered';
    th.answeredAt = now;

    // Escrow release stub; ignore failure in MVP
    try {
      await releaseEscrow({ threadId }); // <-- FIX: remove amount
      db.escrows[threadId] = db.escrows[threadId] || {};
      db.escrows[threadId].status = 'released';
      db.escrows[threadId].releasedAt = now;
    } catch {
      // keep answered state; log later if needed
    }
  }

  writeDB(db);
  return res.json({ ok: true });
}
