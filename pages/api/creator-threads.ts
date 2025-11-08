import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';
import { checkRequestAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = String(req.query.handle || '').trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  // 🔒 Owner-Gate (async)
  const auth = await checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const db = await readDB();
  const creator = (db.creators || {})[handle];
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  if (!creator.wallet) return res.status(403).json({ error: 'Forbidden: no wallet bound yet' });
  if (creator.wallet !== auth.wallet) return res.status(403).json({ error: 'Forbidden: wrong wallet' });

  const allThreads = Object.values<any>(db.threads || {}).filter((t: any) => t?.creator === handle);

  for (const t of allThreads) {
    try { await touchExpiryForThread(t.id); } catch {}
  }

  const db2 = await readDB();

  const withDerived = allThreads.map((t: any) => {
    const msgs = db2.messages?.[t.id] || [];
    const now = Date.now();
    const remainingMs = Math.max(0, (t.deadline ?? 0) - now);
    const latest = db2.threads?.[t.id] || t;
    return {
      id: t.id,
      status: latest.status,
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
