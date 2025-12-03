// pages/api/fan-threads.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fanPubkey =
    typeof req.query.fanPubkey === 'string'
      ? req.query.fanPubkey
      : typeof req.query.wallet === 'string'
      ? req.query.wallet
      : '';
  if (!fanPubkey) {
    return res.status(400).json({ error: 'Missing fanPubkey' });
  }

  // 1) DB lesen
  const db = await readDB();

  const allThreads = Object.values<any>(db.threads || {}).filter(
    (t: any) => t?.fan_pubkey === fanPubkey
  );

  // 2) Lazy TTL für diese Threads (open → ggf. refunded)
  for (const t of allThreads) {
    try {
      await touchExpiryForThread(t.id);
    } catch {
      // MVP: ignore
    }
  }

  // 3) Nochmal lesen, falls sich Status geändert hat
  const db2 = await readDB();

  // 4) Threads anreichern
  const withDerived = allThreads.map((t: any) => {
    const creatorHandle = t.creator;
    const creatorEntry = (db2.creators || {})[creatorHandle] || null;

    const creatorProfile = creatorEntry
      ? {
          handle: creatorEntry.handle,
          displayName: creatorEntry.displayName || creatorEntry.handle || creatorHandle,
          avatarDataUrl: creatorEntry.avatarDataUrl || null,
          price: typeof creatorEntry.price === 'number' ? creatorEntry.price : 20,
        }
      : {
          handle: creatorHandle,
          displayName: creatorHandle,
          avatarDataUrl: null,
          price: 20,
        };

    const msgs = db2.messages?.[t.id] || [];
    const now = Date.now();
    const remainingMs = Math.max(0, (t.deadline ?? 0) - now);

    const latestThread = db2.threads?.[t.id] || t;

    return {
      id: t.id,
      status: latestThread.status,
      amount: t.amount,
      createdAt: t.createdAt,
      deadline: t.deadline,
      remainingMs,
      messagesCount: msgs.length,
      lastMessageAt: msgs.length ? msgs[msgs.length - 1].ts : null,
      creatorProfile, // 👈 neu
    };
  });

  // 5) gruppieren wie vorher
  const grouped = {
    open: withDerived.filter((t) => t.status === 'open'),
    answered: withDerived.filter((t) => t.status === 'answered'),
    refunded: withDerived.filter((t) => t.status === 'refunded'),
    all: withDerived.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  };

  return res.json({ fanPubkey, grouped, total: withDerived.length });
}
