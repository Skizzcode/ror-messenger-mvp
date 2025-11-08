// pages/api/message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid } from '../../lib/db';
import { releaseEscrow } from '../../lib/escrow';
import { basicLimiter } from '../../lib/rate';
import { touchExpiryForThread } from '../../lib/ttl';
import { verifyDetachedSig, extractTs, sha256Base58Server } from '../../lib/verify';

const MAX_LEN = 4000;
const MAX_DRIFT_MS = 5 * 60 * 1000;
const FAN_PRE_REPLY_LIMIT = 2; // 👈 max. Fan-Nachrichten bevor der Creator geantwortet hat

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

  // TTL anstoßen (lazy expiry)
  try { await touchExpiryForThread(threadId); } catch {}

  // DB lesen
  const db = await readDB();
  db.threads = db.threads || {};
  db.messages = db.messages || {};
  db.escrows = db.escrows || {};

  const th = db.threads[threadId];
  if (!th) return res.status(404).json({ error: 'Thread not found' });

  // refunded → nur Creator darf noch
  if (th.status === 'refunded' && from !== 'creator') {
    return res.status(409).json({ error: 'Thread expired/refunded' });
  }

  // =========================
  // 🔐 Signaturprüfung
  // =========================
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

    // Fan → muss zur Fan-Wallet passen (oder Stripe-Fall ohne gebundene Wallet)
    if (from === 'fan') {
      if (th.fan_pubkey) {
        if (pubkeyBase58 !== th.fan_pubkey) {
          return res.status(403).json({ error: 'Fan wallet mismatch' });
        }
      } else if (th.paid_via === 'stripe') {
        // Stripe-Case: noch keine Wallet gebunden → zulassen
      } else {
        return res.status(403).json({ error: 'Thread not bound to fan wallet' });
      }
    }

    // Creator → muss zur Creator-Wallet passen, falls gesetzt
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
    // Keine Signatur: nur erlauben, wenn Stripe-Thread ohne gebundene Fan-Wallet
    if (!(th.paid_via === 'stripe' && !th.fan_pubkey)) {
      return res.status(400).json({ error: 'Signature required' });
    }
  }

  // =========================
  // 🚦 Pre-Reply-Limit für Fans
  // =========================
  if (from === 'fan') {
    const msgs = db.messages[threadId] || [];
    const firstCreatorIndex = msgs.findIndex((m: any) => m.from === 'creator');
    // Zähle nur Fan-Messages vor der ersten Creator-Antwort
    const fanMessagesPreReply = (firstCreatorIndex === -1 ? msgs : msgs.slice(0, firstCreatorIndex))
      .filter((m: any) => m.from === 'fan').length;

    if (fanMessagesPreReply >= FAN_PRE_REPLY_LIMIT) {
      return res.status(409).json({
        error: `Pre-reply limit reached (${FAN_PRE_REPLY_LIMIT}/${FAN_PRE_REPLY_LIMIT}). Please wait for the creator's reply.`,
        code: 'PRE_REPLY_LIMIT',
        limit: FAN_PRE_REPLY_LIMIT
      });
    }
  }

  // =========================
  // ✅ Nachricht speichern
  // =========================
  const now = Date.now();
  db.messages[threadId] = db.messages[threadId] || [];
  db.messages[threadId].push({
    id: uid(),
    threadId,
    from,
    body: cleanBody,
    ts: now,
  });

  // =========================
  // 💸 Auto-Release bei substantieller Creator-Antwort
  // =========================
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
