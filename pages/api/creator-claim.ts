// pages/api/creator-claim.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid, type DB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';
import { OPEN_SIGNUPS, ADMIN_INVITE_CODES } from '../../lib/config';

function ensureCreatorsMap(db: DB) { db.creators = db.creators || {}; }

function ensureCreatorShell(db: DB, handle: string) {
  ensureCreatorsMap(db);
  if (!db.creators[handle]) {
    db.creators[handle] = {
      handle,
      price: 20,
      replyWindowHours: 48,
      wallet: null,
      refCode: `ref_${uid().slice(0, 8)}`,
      displayName: handle,
      avatarDataUrl: '',
      referredBy: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  return db.creators[handle];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = checkRequestAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error || 'Unauthorized' });

  const {
    handle: rawHandle,
    displayName,
    avatarDataUrl,
    ref,               // referral code from another creator or an admin invite code
  } = (req.body || {}) as {
    handle?: string;
    displayName?: string;
    avatarDataUrl?: string;
    ref?: string | null;
  };

  const handle = String(rawHandle || '').trim().toLowerCase();
  if (!handle || !/^[a-z0-9\-_.]{3,24}$/.test(handle)) {
    return res.status(400).json({ error: 'Invalid handle (3-24 chars, a-z 0-9 - _ .)' });
  }

  const db = await readDB();
  ensureCreatorsMap(db as DB);

  // hard-gate: require ref unless open signups
  let refSource: string | null = null;

  if (!OPEN_SIGNUPS) {
    const code = String(ref || '').trim();
    if (!code) {
      return res.status(403).json({ error: 'Referral required' });
    }

    // check admin invite codes first
    if (ADMIN_INVITE_CODES.includes(code)) {
      refSource = `admin:${code}`;
    } else {
      // otherwise: must match an existing creator's refCode
      const creators = db.creators || {};
      let ok = false;
      for (const c of Object.values<any>(creators)) {
        if (c?.refCode && c.refCode === code) { ok = true; break; }
      }
      if (!ok) {
        return res.status(403).json({ error: 'Invalid referral code' });
      }
      refSource = code; // the creator refCode itself
    }
  } else {
    // open signups → optional ref captured if present
    if (typeof ref === 'string' && ref.trim()) refSource = ref.trim();
  }

  // handle already taken?
  const existing = db.creators![handle];
  if (existing?.wallet) {
    return res.status(409).json({ error: 'Handle already taken' });
  }

  // create/bind
  const c = ensureCreatorShell(db as DB, handle);
  if (c.wallet && c.wallet !== auth.wallet) {
    return res.status(409).json({ error: 'Handle bound to another wallet' });
  }

  c.wallet = auth.wallet!;
  if (typeof displayName === 'string') c.displayName = displayName.trim().slice(0, 120);

  if (typeof avatarDataUrl === 'string' && avatarDataUrl.startsWith('data:image/')) {
    const approxSize = Math.floor(avatarDataUrl.length * 0.75);
    if (approxSize <= 500 * 1024) {
      c.avatarDataUrl = avatarDataUrl;
    } else {
      return res.status(400).json({ error: 'Avatar too large (max ~500KB)' });
    }
  }

  if (!c.referredBy && refSource) c.referredBy = refSource;
  c.updatedAt = Date.now();

  await writeDB(db);
  return res.json({
    ok: true,
    handle: c.handle,
    displayName: c.displayName,
    avatarDataUrl: c.avatarDataUrl || null,
    refCode: c.refCode,
  });
}
