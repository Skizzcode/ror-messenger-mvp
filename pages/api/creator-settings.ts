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
    };
  }
  return db.creators[handle];
}

// Hilfsfunktion: findet Creator, der bereits dieselbe Wallet nutzt
function findCreatorByWallet(db: DB, wallet: string, exceptHandle?: string) {
  if (!db.creators) return null;
  const values = Object.values(db.creators);
  return (
    values.find(
      (c: any) => c.wallet === wallet && c.handle !== (exceptHandle || c.handle),
    ) || null
  );
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
  const creatorCount = Object.keys((db as DB).creators || {}).length;

  if (req.method === 'GET') {
    return res.json({
      handle: creator.handle,
      displayName: creator.displayName || '',
      avatarDataUrl: creator.avatarDataUrl || '',
      price: creator.price ?? 20,
      refCode: creator.refCode || null,
      replyWindowHours: creator.replyWindowHours ?? 48,
    });
  }

  if (req.method === 'POST') {
    const {
      price,
      replyWindowHours,
      displayName,
      avatarDataUrl,
      referredBy,
      wallet,
    } = (req.body ?? {}) as {
      price?: number | string;
      replyWindowHours?: number | string;
      displayName?: string;
      avatarDataUrl?: string;
      referredBy?: string | null;
      wallet?: string | null;
    };

    // 🔹 BOOTSTRAP: ERSTER CREATOR (KEIN AUTH, NUR EINMAL)
    if (creatorCount === 0) {
      if (typeof wallet !== 'string' || !wallet.trim()) {
        return res
          .status(400)
          .json({ error: 'Bootstrap requires wallet in body' });
      }

      const w = wallet.trim();
      creator.wallet = w;

      if (price !== undefined) creator.price = Number(price) || 0;
      if (replyWindowHours !== undefined) {
        creator.replyWindowHours = Number(replyWindowHours) || 48;
      }
      if (typeof displayName === 'string') {
        creator.displayName = displayName.trim();
      }

      if (
        typeof avatarDataUrl === 'string' &&
        avatarDataUrl.startsWith('data:image/')
      ) {
        const approxSize = avatarDataUrl.length * 0.75;
        if (approxSize < 500 * 1024) {
          creator.avatarDataUrl = avatarDataUrl;
        }
      }

      if (
        !creator.referredBy &&
        typeof referredBy === 'string' &&
        referredBy.trim().length > 0
      ) {
        creator.referredBy = referredBy.trim();
      }

      await writeDB(db);
      return res.json({
        ok: true,
        settings: {
          handle: creator.handle,
          displayName: creator.displayName,
          avatarDataUrl: creator.avatarDataUrl,
          price: creator.price,
          refCode: creator.refCode,
          replyWindowHours: creator.replyWindowHours,
          wallet: creator.wallet,
        },
      });
    }

    // 🔒 AB HIER: NORMALER PFAD (INVITE/OWNER-GATE)

    const auth = await checkRequestAuth(req);
    if (!auth.ok || !auth.wallet) {
      return res.status(401).json({ error: auth.error || 'UNAUTHORIZED' });
    }
    const authWallet = auth.wallet;

    // 1 Wallet → 1 Creator erzwingen
    const other = findCreatorByWallet(db as DB, authWallet, handle);
    if (other) {
      return res.status(403).json({
        error: `Wallet already bound to creator @${other.handle}`,
      });
    }

    if (!creator.wallet) {
      creator.wallet = authWallet;
    } else if (creator.wallet !== authWallet) {
      return res.status(403).json({ error: 'Forbidden: wrong wallet' });
    }

    if (price !== undefined) creator.price = Number(price) || 0;
    if (replyWindowHours !== undefined) {
      creator.replyWindowHours = Number(replyWindowHours) || 48;
    }
    if (typeof displayName === 'string') {
      creator.displayName = displayName.trim();
    }

    if (
      typeof avatarDataUrl === 'string' &&
      avatarDataUrl.startsWith('data:image/')
    ) {
      const approxSize = avatarDataUrl.length * 0.75;
      if (approxSize < 500 * 1024) {
        creator.avatarDataUrl = avatarDataUrl;
      }
    }

    // Optionales Wallet-Feld im Body → muss mit authWallet matchen
    if (typeof wallet === 'string' && wallet) {
      if (wallet !== authWallet) {
        return res.status(403).json({ error: 'Forbidden: wallet mismatch' });
      }
      creator.wallet = wallet;
    }

    if (
      !creator.referredBy &&
      typeof referredBy === 'string' &&
      referredBy.trim().length > 0
    ) {
      creator.referredBy = referredBy.trim();
    }

    await writeDB(db);
    return res.json({
      ok: true,
      settings: {
        handle: creator.handle,
        displayName: creator.displayName,
        avatarDataUrl: creator.avatarDataUrl,
        price: creator.price,
        refCode: creator.refCode,
        replyWindowHours: creator.replyWindowHours,
        wallet: creator.wallet,
      },
    });
  }

  return res.status(405).end();
}
