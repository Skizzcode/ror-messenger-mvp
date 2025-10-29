// pages/api/creator-settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid } from '../../lib/db';

function ensureCreator(db: any, handle: string) {
  db.creators = db.creators || {};
  if (!db.creators[handle]) {
    db.creators[handle] = {
      handle,
      price: 20,
      replyWindowHours: 48,
      wallet: null,
      refCode: `ref_${uid().slice(0,8)}`,
    };
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { handle } = req.method === 'GET' ? req.query : req.body;
  if (!handle || typeof handle !== 'string') return res.status(400).json({ error: 'Missing handle' });

  const db = readDB();
  ensureCreator(db, handle);

  if (req.method === 'GET') {
    return res.json(db.creators[handle]);
  }

  if (req.method === 'POST') {
    const { price, replyWindowHours, wallet } = req.body || {};
    if (price !== undefined) db.creators[handle].price = Number(price) || 0;
    if (replyWindowHours !== undefined) db.creators[handle].replyWindowHours = Number(replyWindowHours) || 48;
    if (wallet !== undefined) db.creators[handle].wallet = wallet || null;
    writeDB(db);
    return res.json({ ok: true, settings: db.creators[handle] });
  }

  return res.status(405).end();
}
