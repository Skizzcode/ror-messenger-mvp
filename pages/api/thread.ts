// pages/api/thread.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';
import { touchExpiryForThread } from '../../lib/ttl';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = (req.query.id as string) || '';
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // Lazy-Expiry: falls abgelaufen → sofort refunded markieren
  try {
    await touchExpiryForThread(id);
  } catch {
    // ignore for MVP
  }

  // DB lesen
  const db = await readDB();
  const thread = db.threads?.[id] || null;
  const messages = db.messages?.[id] || [];

  // 👇 neu: Creator-Profil dazupacken
  let creatorProfile: {
    handle: string;
    displayName: string;
    avatarDataUrl: string | null;
    price: number;
  } | null = null;

  if (thread?.creator) {
    const ce = (db.creators || {})[thread.creator] || null;
    if (ce) {
      creatorProfile = {
        handle: ce.handle,
        displayName: ce.displayName || ce.handle || thread.creator,
        avatarDataUrl: ce.avatarDataUrl || null,
        price: typeof ce.price === 'number' ? ce.price : 20,
      };
    } else {
      // fallback falls creator noch nicht im creators-objekt ist
      creatorProfile = {
        handle: thread.creator,
        displayName: thread.creator,
        avatarDataUrl: thread.creator_avatar || null,
        price: typeof thread.amount === 'number' ? thread.amount : 20,
      };
    }
  }

  return res.json({ thread, messages, creatorProfile });
}
