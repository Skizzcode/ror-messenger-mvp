// pages/api/message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid } from '../../lib/db';
import { releaseEscrow } from '../../lib/escrow';
import { basicLimiter } from '../../lib/rate';
import { touchExpiryForThread } from '../../lib/ttl';
import { verifyDetachedSig, extractTs, sha256Base58Server } from '../../lib/verify';

const MAX_LEN = 4000;
const MAX_DRIFT_MS = 5 * 60 * 1000;

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
  if (from !== 'fan' && from !== 'creator') {
    return res.status(400).json({ error: 'Invalid sender' });
  }

  const cleanBody = String(body).slice(0, MAX_LEN);

  // TTL anstoßen
  try {
    await touchExpiryForThread(threadId);
  } catch {}

  const db = await readDB();
  const th = db.threads?.[threadId];
  if (!th) return res.status(404).json({ error: 'Thread not found' });

  // refunded → nur Creator darf noch
  if (th.status === 'refunded' && from !== 'creator') {
    return res.status(409).json({ error: 'Thread expired/refunded' });
  }

  // 🔐 Signatur-Pflicht (außer ganz alter Stripe-Thread)
  if (sigBase58 && msg && pubkeyBase58) {
    const bodyhash = sha256Base58Server(cleanBody);
    const expectedPrefix = `ROR|message|thread=${threadId}|from=${from}|bodyhash=${bodyhash}|ts=`;
    if (!msg.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: 'Invalid message payload' });
    }

    const ts = extractTs(msg);
    if (!ts || Math.abs(Date.now() - ts) > MAX_DRIFT_MS) {
      return res.status(400).json({ error: 'Expired/invalid timestamp' });
    }

    // 1) Fan → muss zur Fan-Wallet passen (oder Thread hat noch keine)
    if (from === 'fan') {
      if (th.fan_pubkey) {
        if (pubkeyBase58 !== th.fan_pubkey) {
          return res.status(403).json({ error: 'Fan wallet mismatch' });
        }
      } else if (th.paid_via === 'stripe') {
        // Stripe-Case: noch keine Wallet → wir lassen es durch
      } else {
        return res.status(403).json({ error: 'Thread not bound to fan wallet' });
      }
    }

    // 2) Creator → muss zur Creator-Wallet passen, falls gesetzt
    if (from === 'creator') {
      if (th.creator_pubkey && pubkeyBase58 !== th.creator_pubkey) {
        return res.status(403).json({ error: 'Creator wallet mismatch' });
      }
    }

    const ok = verifyDetachedSig(msg, sigBase58, pubkeyBase58);
    if (!ok) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } else {
    // kein sig → nur erlauben, wenn es ein Stripe-Thread ohne Wallet ist
    if (!(th.paid_via === 'stripe' && !th.fan_pubkey)) {
      return res.status(400).json({ error: 'Signature required' });
    }
  }

  const now = Date.now();
  db.messages[threadId] = db.messages[threadId] || [];
  db.messages[threadId].push({
    id: uid(),
    threadId,
    from,
    body: cleanBody,
    ts: now,
  });

  // Auto-Release
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
