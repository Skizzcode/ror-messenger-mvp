// pages/api/message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid } from '../../lib/db';
import { releaseEscrow } from '../../lib/escrow'; // server-side stub
import { basicLimiter } from '../../lib/rate';
import { touchExpiryForThread } from '../../lib/ttl';

const MAX_LEN = 4000;

function isSubstantial(text: string) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length >= 30 && /[A-Za-z]/.test(t);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!basicLimiter(req, { maxPerMin: 20 })) {
    return res.status(429).json({ error: 'Rate limited' });
  }

  const { threadId, from, body, sigBase58, msg, pubkeyBase58 } = req.body || {};
  if (!threadId || !from || !body) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const cleanBody = String(body).slice(0, MAX_LEN);

  // Lazy TTL
  try { await touchExpiryForThread(threadId); } catch {}

  // ✅ Upstash: async read
  const db = await readDB();
  const th = db.threads?.[threadId];
  if (!th) return res.status(404).json({ error: 'Thread not found' });

  if (th.status === 'refunded' && from !== 'creator') {
    return res.status(409).json({ error: 'Thread expired/refunded' });
  }

  if (sigBase58 && msg && pubkeyBase58) {
    // TODO: strict verify
  }

  const now = Date.now();
  db.messages[threadId] = db.messages[threadId] || [];
  db.messages[threadId].push({
    id: uid(),
    threadId,
    from,
    body: cleanBody,
    ts: now
  });

  if (from === 'creator' && th.status === 'open' && isSubstantial(cleanBody)) {
    th.status = 'answered';
    th.answeredAt = now;
    try {
      await releaseEscrow({ threadId });
      db.escrows[threadId] = db.escrows[threadId] || {};
      db.escrows[threadId].status = 'released';
      db.escrows[threadId].releasedAt = now;
    } catch {}
  }

  await writeDB(db);
  return res.json({ ok: true });
}
