import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, type DB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';

function ensureCreatorsMap(db: DB) { db.creators = db.creators || {}; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    handle,
    displayName,
    price,
    replyWindowHours,
    avatarDataUrl,
    ref, // referral code required for invite-only
  } = (req.body || {}) as {
    handle?: string;
    displayName?: string;
    price?: number;
    replyWindowHours?: number;
    avatarDataUrl?: string | null;
    ref?: string | null;
  };

  const cleanHandle = String(handle || '').trim().toLowerCase();
  if (!cleanHandle || !/^[a-z0-9-_]{2,}$/.test(cleanHandle)) {
    return res.status(400).json({ error: 'Invalid handle' });
  }

  // Invite-only: valid ref required
  const db = await readDB();
  ensureCreatorsMap(db as DB);
  const creators = (db as DB).creators;

  const refOwner = Object.values<any>(creators).find((c: any) => c?.refCode === ref);
  if (!ref || !refOwner) {
    return res.status(403).json({ error: 'Invite required (invalid referral code)' });
  }

  if (creators[cleanHandle]?.wallet) {
    return res.status(409).json({ error: 'Handle already taken' });
  }

  // 🔒 Owner => the signer becomes the bound wallet for this creator
  const auth = await checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  // Create or update skeleton
  creators[cleanHandle] = creators[cleanHandle] || {
    handle: cleanHandle,
    price: 20,
    replyWindowHours: 48,
    wallet: null,
    refCode: `ref_${Math.random().toString(36).slice(2, 10)}`,
    displayName: '',
    avatarDataUrl: '',
    referredBy: ref,
  };

  const entry = creators[cleanHandle];
  entry.displayName = typeof displayName === 'string' ? displayName.trim() : (entry.displayName || '');
  if (typeof price === 'number') entry.price = price;
  if (typeof replyWindowHours === 'number') entry.replyWindowHours = replyWindowHours;

  if (typeof avatarDataUrl === 'string' && avatarDataUrl.startsWith('data:image/')) {
    const approxSize = avatarDataUrl.length * 0.75;
    if (approxSize < 500 * 1024) entry.avatarDataUrl = avatarDataUrl;
  }

  // bind wallet to signer
  entry.wallet = auth.wallet!;

  await writeDB(db);
  return res.json({ ok: true, handle: cleanHandle });
}
