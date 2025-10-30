// pages/api/creator-threads.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = req.query.handle as string;
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  // read DB
  const db = await readDB();

  const allThreads = Object.values<any>(db.threads || {}).filter(
    (t: any) => t?.creator === handle
  );

  // hole Creator-Profil, falls vorhanden
  const creatorEntry = (db.creators || {})[handle] || null;
  const creatorProfile = creatorEntry
    ? {
        handle: creatorEntry.handle,
        displayName: creatorEntry.displayName || creatorEntry.handle || handle,
        avatarDataUrl: creatorEntry.avatarDataUrl || null,
        price: typeof creatorEntry.price === 'number' ? creatorEntry.price : 20,
      }
    : {
        handle,
        displayName: handle,
        avatarDataUrl: null,
        price: 20,
      };

  // optional: Lazy TTL für jeden Thread (damit open → refunded werden kann)
  for (const t of allThreads) {
    try {
      await touchExpiryForThread(t.id);
    } catch {
      // ignore for MVP
    }
  }

  // nach evtl. TTL-Update nochmal lesen
  const db2 = await readDB();

  const withDerived = allThreads.map((t: any) => {
    const msgs = (db2.messages?.[t.id] || []);
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
      // 👇 neu: Creator-Profil gleich mitliefern
      creatorProfile,
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
