// pages/api/fan-threads.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fanPubkey = req.query.fanPubkey as string;
  if (!fanPubkey) {
    return res.status(400).json({ error: 'Missing fanPubkey' });
  }

  // ⬇️ Upstash: async read
  const db = await readDB();

  // Alle Threads des Fans
  const threads = Object.values<any>(db.threads || {}).filter(
    (t: any) => t?.fan_pubkey === fanPubkey
  );

  // Optional: Lazy TTL je Thread (abgelaufene open → refunded)
  for (const t of threads) {
    try {
      await touchExpiryForThread(t.id);
    } catch {
      // MVP: still continue; status wird ggf. später bereinigt
    }
  }

  // Nach evtl. Status-Änderungen erneut lesen
  const db2 = await readDB();

  const withDerived = threads.map((t: any) => {
    const msgs = db2.messages?.[t.id] || [];
    const now = Date.now();
    const remainingMs = Math.max(0, (t.deadline ?? 0) - now);
    return {
      id: t.id,
      status: db2.threads?.[t.id]?.status ?? t.status,
      amount: t.amount,
      createdAt: t.createdAt,
      deadline: t.deadline,
      remainingMs,
      messagesCount: msgs.length,
      lastMessageAt: msgs.length ? msgs[msgs.length - 1].ts : null,
    };
  });

  const grouped = {
    open: withDerived.filter(t => t.status === 'open'),
    answered: withDerived.filter(t => t.status === 'answered'),
    refunded: withDerived.filter(t => t.status === 'refunded'),
    all: withDerived.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  };

  return res.json({ fanPubkey, grouped, total: withDerived.length });
}
