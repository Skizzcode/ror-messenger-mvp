// pages/api/creator-authz.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, type DB, uid } from '../../lib/db';

function ensureCreatorsMap(db: DB) {
  db.creators = db.creators || {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const rawHandle = String(req.query.handle || '').trim().toLowerCase();
    if (!rawHandle) {
      return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });
    }

    const db = await readDB();
    ensureCreatorsMap(db as DB);

    // Wenn Creator noch nicht existiert → automatisch anlegen (ohne Wallet)
    if (!db.creators[rawHandle]) {
      (db as DB).creators[rawHandle] = {
        handle: rawHandle,
        price: 20,
        replyWindowHours: 48,
        wallet: null,
        refCode: `ref_${uid().slice(0, 8)}`,
        displayName: '',
        avatarDataUrl: '',
        referredBy: null,
      };
      await writeDB(db as DB);
    }

    const creator = (db as DB).creators[rawHandle];

    // 🧨 DEV-MODUS: Immer ok, egal welche Wallet
    return res.status(200).json({
      ok: true,
      handle: creator.handle,
      wallet: creator.wallet || null,
      via: 'dev-open-auth',
    });
  } catch (e: any) {
    console.error('creator-authz error', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
