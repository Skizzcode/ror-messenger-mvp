// pages/api/creator-claim.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid, type DB } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    handle,
    displayName,
    price,
    replyWindowHours,
    avatarDataUrl,
    ref, // optional: referral code from inviter creator
  } = (req.body || {}) as {
    handle?: string;
    displayName?: string;
    price?: number | string;
    replyWindowHours?: number | string;
    avatarDataUrl?: string | null;
    ref?: string | null;
  };

  const cleanHandle = String(handle || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
  if (!cleanHandle || cleanHandle.length < 2) {
    return res.status(400).json({ error: 'Invalid handle' });
  }

  const db = await readDB();
  (db as DB).creators = (db as DB).creators || {};

  // Handle muss frei sein
  if ((db as DB).creators[cleanHandle]) {
    return res.status(409).json({ error: 'Handle already taken' });
  }

  const p = Math.max(1, Number(price ?? 20));
  const rwh = Math.max(1, Number(replyWindowHours ?? 48));

  (db as DB).creators[cleanHandle] = {
    handle: cleanHandle,
    displayName: String(displayName || cleanHandle),
    price: p,
    replyWindowHours: rwh,
    wallet: null,                 // kann der Creator später mit „Use connected wallet“ setzen
    avatarDataUrl: avatarDataUrl || null,
    refCode: `ref_${uid().slice(0, 8)}`,
    referredBy: ref || null,      // der Einladende (Creator→Creator)
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await writeDB(db);
  return res.json({ ok: true, handle: cleanHandle });
}
