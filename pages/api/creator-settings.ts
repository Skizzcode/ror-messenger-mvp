// pages/api/creator-settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid, type DB } from '../../lib/db';

function ensureCreatorsMap(db: DB) {
  // Falls du meine aktuelle lib/db.ts nutzt, ist creators bereits vorhanden.
  // Trotzdem defensiv:
  db.creators = db.creators || {};
}

function ensureCreator(db: DB, handle: string) {
  ensureCreatorsMap(db);
  if (!db.creators[handle]) {
    db.creators[handle] = {
      handle,
      price: 20,
      replyWindowHours: 48,
      wallet: null,
      refCode: `ref_${uid().slice(0, 8)}`
    };
  }
  return db.creators[handle];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handleParam =
    req.method === 'GET'
      ? (req.query?.handle as string | undefined)
      : (req.body?.handle as string | undefined);

  const handle = (handleParam || '').trim();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const db = await readDB();
  const creator = ensureCreator(db as DB, handle);

  if (req.method === 'GET') {
    return res.json(creator);
  }

  if (req.method === 'POST') {
    const { price, replyWindowHours, wallet } = (req.body ?? {}) as {
      price?: number | string;
      replyWindowHours?: number | string;
      wallet?: string | null;
    };

    if (price !== undefined) creator.price = Number(price) || 0;
    if (replyWindowHours !== undefined) creator.replyWindowHours = Number(replyWindowHours) || 48;
    if (wallet !== undefined) creator.wallet = wallet || null;

    await writeDB(db);
    return res.json({ ok: true, settings: creator });
  }

  return res.status(405).end();
}
