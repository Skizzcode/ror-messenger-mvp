// pages/api/fan-threads.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { fanPubkey } = req.query;
  if (!fanPubkey || typeof fanPubkey !== 'string') {
    return res.status(400).json({ error: 'Missing fanPubkey' });
  }

  const db = readDB();
  const threads = Object.values(db.threads || {}).filter(
    (t: any) => t.fan_pubkey === fanPubkey
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
      messagesCount: msgs.length,
      lastMessageAt: msgs.length ? msgs[msgs.length - 1].ts : null,
    };
  });

  const grouped = {
    open: withDerived.filter(t => t.status === 'open'),
    answered: withDerived.filter(t => t.status === 'answered'),
    refunded: withDerived.filter(t => t.status === 'refunded'),
    all: withDerived.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0)),
  };

  return res.json({ fanPubkey, grouped, total: withDerived.length });
}
