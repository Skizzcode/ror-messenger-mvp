// pages/api/creator-threads.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';
import { checkRequestAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handle = (req.query.handle as string || '').trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  // 🔐 Require signed auth headers
  const auth = checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error || 'Unauthorized' });

  // DB lesen
  const db = await readDB();
  const creatorEntry = (db.creators || {})[handle];

  // Creator existiert und muss Wallet gebunden haben
  if (!creatorEntry?.wallet) {
    return res.status(403).json({ error: 'Creator wallet not set. Bind your wallet in settings first.' });
  }
  // Wallet muss matchen
  if (creatorEntry.wallet !== auth.wallet) {
    return res.status(403).json({ error: 'Forbidden (wallet mismatch)' });
  }

  // Threads des Creators
  const allThreads = Object.values<any>(db.threads || {}).filter(
    (t: any) => t?.creator === handle
  );

  // Lazy TTL (open → ggf. refunded)
  for (const t of allThreads) {
    try { await touchExpiryForThread(t.id); } catch {}
  }

  // Nach evtl. Status-Updates erneut lesen
  const db2 = await readDB();

  // Creator-Profil beilegen (für UI)
  const creatorProfile = {
    handle: creatorEntry.handle,
    displayName: creatorEntry.displayName || creatorEntry.handle || handle,
    avatarDataUrl: creatorEntry.avatarDataUrl || null,
    price: typeof creatorEntry.price === 'number' ? creatorEntry.price : 20,
  };

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
