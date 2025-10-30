// pages/api/creator-threads.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = req.query.handle as string;
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  // ⬇️ Upstash: async read
  const db = await readDB();

  const threads = Object.values<any>(db.threads || {}).filter(
    (t: any) => t?.creator === handle
  );

  const withDerived = threads.map((t: any) => {
    const msgs = (db.messages?.[t.id] || []);
    const now = Date.now();
    const remainingMs = Math.max(0, (t.deadline ?? 0) - now);
    return {
      id: t.id,
      status: t.status,
      amount: t.amount,
      createdAt: t.createdAt,
      deadline: t.deadline,
      remainingMs,
      fanPubkey: t.fan_pubkey || null,
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

  return res.json({ handle, grouped, total: withDerived.length });
}
