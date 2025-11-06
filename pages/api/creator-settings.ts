// pages/api/creator-settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid, type DB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';

function ensureCreatorsMap(db: DB) {
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
      refCode: `ref_${uid().slice(0, 8)}`,
      displayName: '',
      avatarDataUrl: '',
      referredBy: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  return db.creators[handle];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const handleParam =
    req.method === 'GET'
      ? (req.query?.handle as string | undefined)
      : (req.body?.handle as string | undefined);

  const handle = (handleParam || '').trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const db = await readDB();
  const creator = ensureCreator(db as DB, handle);

  // GET ist öffentlich (für Landing/Chat)
  if (req.method === 'GET') {
    return res.json(creator);
  }

  // POST erfordert Wallet-Signatur
  if (req.method === 'POST') {
    const auth = checkRequestAuth(req);
    if (!auth.ok) return res.status(401).json({ error: auth.error || 'Unauthorized' });

    // Falls noch keine Wallet gebunden: erste gültige Signatur bindet den Owner
    if (!creator.wallet) {
      creator.wallet = auth.wallet!;
    }

    // Nur der gebundene Owner darf schreiben
    if (creator.wallet !== auth.wallet) {
      return res.status(403).json({ error: 'Forbidden (wallet mismatch)' });
    }

    const {
      price,
      replyWindowHours,
      wallet,          // optional: falls Client explizit die gleiche Wallet mitschickt
      displayName,
      avatarDataUrl,
      referredBy,      // nur beim ersten Mal setzbar
    } = (req.body ?? {}) as {
      price?: number | string;
      replyWindowHours?: number | string;
      wallet?: string | null;
      displayName?: string;
      avatarDataUrl?: string;
      referredBy?: string | null;
    };

    // Preis & Reply-Window (mit minimalen Schranken)
    if (price !== undefined) {
      const p = Math.max(1, Number(price) || 0);
      creator.price = p;
    }
    if (replyWindowHours !== undefined) {
      const r = Math.max(1, Number(replyWindowHours) || 1);
      creator.replyWindowHours = r;
    }

    // Wallet darf nur gesetzt werden, wenn sie der signierenden Wallet entspricht
    if (wallet !== undefined) {
      if (wallet && wallet !== auth.wallet) {
        return res.status(403).json({ error: 'Wallet must match signed wallet' });
      }
      // explizites Unbinden verhindern (MVP)
      creator.wallet = auth.wallet!;
    }

    // Display-Name
    if (typeof displayName === 'string') {
      creator.displayName = displayName.trim().slice(0, 120);
    }

    // Avatar als Data-URL (kleine Größenbremse)
    if (typeof avatarDataUrl === 'string') {
      if (avatarDataUrl.startsWith('data:image/')) {
        const approxSize = Math.floor(avatarDataUrl.length * 0.75); // grob
        if (approxSize <= 500 * 1024) {
          creator.avatarDataUrl = avatarDataUrl;
        } else {
          return res.status(400).json({ error: 'Avatar too large (max ~500KB)' });
        }
      } else if (avatarDataUrl === '') {
        // leeren String erlauben → bedeutet "entfernen"
        creator.avatarDataUrl = '';
      }
    }

    // ReferredBy nur beim ersten Mal setzen
    if (!creator.referredBy && typeof referredBy === 'string' && referredBy.trim()) {
      creator.referredBy = referredBy.trim();
    }

    creator.updatedAt = Date.now();
    await writeDB(db);
    return res.json({ ok: true, settings: creator });
  }

  return res.status(405).end();
}
