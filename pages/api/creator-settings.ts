// pages/api/creator-settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid, type DB } from '../../lib/db';

function ensureCreatorsMap(db: DB) {
  db.creators = db.creators || {};
}

function ensureCreator(db: DB, handle: string) {
  ensureCreatorsMap(db);
  if (!db.creators[handle]) {
    db.creators[handle] = {
      handle,
      // neu: displayName = handle als default
      displayName: handle,
      price: 20,
      replyWindowHours: 48,
      wallet: null,
      refCode: `ref_${uid().slice(0, 8)}`,
      avatarUrl: '',
    };
  } else {
    // alte Einträge evtl. ohne Felder → auffüllen
    db.creators[handle].displayName = db.creators[handle].displayName || handle;
    db.creators[handle].price = db.creators[handle].price ?? 20;
    db.creators[handle].replyWindowHours = db.creators[handle].replyWindowHours ?? 48;
    db.creators[handle].wallet = db.creators[handle].wallet ?? null;
    db.creators[handle].refCode =
      db.creators[handle].refCode || `ref_${uid().slice(0, 8)}`;
    db.creators[handle].avatarUrl = db.creators[handle].avatarUrl || '';
  }
  return db.creators[handle];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // handle kann in GET über query, in POST über body kommen
  const handleParam =
    req.method === 'GET'
      ? (req.query?.handle as string | undefined)
      : (req.body?.handle as string | undefined);

  const handle = (handleParam || '').trim();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const db = await readDB();
  const creator = ensureCreator(db as DB, handle);

  // READ
  if (req.method === 'GET') {
    return res.json({
      handle: creator.handle,
      displayName: creator.displayName ?? handle,
      price: creator.price ?? 20,
      replyWindowHours: creator.replyWindowHours ?? 48,
      wallet: creator.wallet ?? '',
      refCode: creator.refCode ?? '',
      avatarUrl: creator.avatarUrl ?? '',
    });
  }

  // UPDATE
  if (req.method === 'POST') {
    const {
      price,
      replyWindowHours,
      wallet,
      refCode,
      avatarUrl,
      displayName,
    } = (req.body ?? {}) as {
      price?: number | string;
      replyWindowHours?: number | string;
      wallet?: string | null;
      refCode?: string | null;
      avatarUrl?: string | null;
      displayName?: string | null;
    };

    // nur setzen, wenn geschickt
    if (price !== undefined) {
      const n = Number(price);
      creator.price = Number.isFinite(n) && n > 0 ? n : 0;
    }

    if (replyWindowHours !== undefined) {
      const n = Number(replyWindowHours);
      creator.replyWindowHours = Number.isFinite(n) && n > 0 ? n : 1;
    }

    if (wallet !== undefined) {
      creator.wallet = wallet || null;
    }

    if (refCode !== undefined) {
      creator.refCode = (refCode || '').trim();
    }

    if (avatarUrl !== undefined) {
      creator.avatarUrl = (avatarUrl || '').trim();
    }

    if (displayName !== undefined) {
      const clean = (displayName || '').trim();
      creator.displayName = clean || handle;
    }

    await writeDB(db);
    return res.json({ ok: true, settings: creator });
  }

  return res.status(405).end();
}
