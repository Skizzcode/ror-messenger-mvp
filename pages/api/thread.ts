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
    avgReplyMs?: number | null;
    answerRate?: number | null;
    replyWindowHours?: number | null;
    fastPrice?: number | null;
    fastReplyWindowHours?: number | null;
    offers?: any[] | null;
    stripeAccountId?: string | null;
  } | null = null;

  const creators = db.creators || {};
  const creatorKey = thread?.creator || id; // id kann auch der Handle sein, wenn noch kein Thread existiert

  if (creators[creatorKey]) {
    const ce = creators[creatorKey];
    creatorProfile = {
      handle: ce.handle || creatorKey,
      displayName: ce.displayName || ce.handle || creatorKey,
      avatarDataUrl: ce.avatarDataUrl || null,
      price: typeof ce.price === 'number' ? ce.price : 20,
      avgReplyMs: typeof ce.avgReplyMs === 'number' ? ce.avgReplyMs : null,
      answerRate: typeof ce.answerRate === 'number' ? ce.answerRate : null,
      replyWindowHours: typeof ce.replyWindowHours === 'number' ? ce.replyWindowHours : null,
      fastPrice: typeof ce.fastPrice === 'number' ? ce.fastPrice : null,
      fastReplyWindowHours: typeof ce.fastReplyWindowHours === 'number' ? ce.fastReplyWindowHours : null,
      offers: Array.isArray((ce as any).offers) ? (ce as any).offers : [],
      stripeAccountId: ce.stripeAccountId || null,
    };
  } else if (thread?.creator) {
    // fallback falls creator noch nicht im creators-objekt ist
    creatorProfile = {
      handle: thread.creator,
      displayName: thread.creator,
      avatarDataUrl: thread.creator_avatar || null,
      price: typeof thread.amount === 'number' ? thread.amount : 20,
      avgReplyMs: null,
      answerRate: null,
      replyWindowHours: thread.ttlHours || null,
      fastPrice: null,
      fastReplyWindowHours: null,
      offers: [],
      stripeAccountId: null,
    };
  }

  return res.json({ thread, messages, creatorProfile });
}
