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

function findCreatorByWallet(db: DB, wallet: string, exceptHandle?: string) {
  if (!db.creators) return null;
  const values = Object.values(db.creators) as any[];
  return (
    values.find(
      (c) => c.wallet === wallet && c.handle !== (exceptHandle || c.handle),
    ) || null
  );
}

function hasCreatorWithWallet(db: DB): boolean {
  if (!db.creators) return false;
  return Object.values(db.creators).some((c: any) => !!c.wallet);
}

function isValidReferral(db: DB, refCode: string): boolean {
  if (!db.creators) return false;
  const values = Object.values(db.creators) as any[];
  return values.some((c: any) => c.refCode === refCode);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const handleParam =
    req.method === 'GET'
      ? (req.query?.handle as string | undefined)
      : (req.body?.handle as string | undefined);

  const handle = (handleParam || '').trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const db = await readDB();
  ensureCreatorsMap(db as DB);

  const creators = (db as DB).creators;
  const existingCreator = creators[handle] || null;
  const hasAnyWallet = hasCreatorWithWallet(db as DB);
  const isBootstrap = !hasAnyWallet; // ✅ first-ever creator
  const adminInviteCode =
    process.env.CREATOR_ADMIN_INVITE_CODE || '';

  if (req.method === 'GET') {
    const creator =
      existingCreator || ensureCreator(db as DB, handle);
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
      adminCode,
    } = (req.body ?? {}) as {
      price?: number | string;
      replyWindowHours?: number | string;
      displayName?: string;
      avatarDataUrl?: string;
      referredBy?: string | null;
      wallet?: string | null;
      adminCode?: string | null;
    };

    // 🔹 1) BOOTSTRAP-MODUS: erster Creator überhaupt
    if (isBootstrap) {
      if (typeof wallet !== 'string' || !wallet.trim()) {
        return res
          .status(400)
          .json({ error: 'Bootstrap requires wallet in body' });
      }

      const w = wallet.trim();
      const creator =
        existingCreator || ensureCreator(db as DB, handle);
      creator.wallet = w;

      if (price !== undefined) {
        creator.price = Number(price) || 0;
      }
      if (replyWindowHours !== undefined) {
        creator.replyWindowHours =
          Number(replyWindowHours) || 48;
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

    // 🔹 2) NORMALER PFAD: Invite-only + Auth
    const auth = await checkRequestAuth(req);
    if (!auth.ok || !auth.wallet) {
      return res.status(401).json({
        error: auth.error || 'UNAUTHORIZED',
      });
    }
    const authWallet = auth.wallet;

    const creator =
      existingCreator || ensureCreator(db as DB, handle);
    const isNewBinding = !creator.wallet;

    // 1 Wallet → 1 Creator
    const other = findCreatorByWallet(db as DB, authWallet, handle);
    if (other) {
      return res.status(403).json({
        error: `Wallet already bound to creator @${other.handle}`,
      });
    }

    if (isNewBinding) {
      // 🔐 INVITE-ONLY ENFORCED
      const ref =
        typeof referredBy === 'string'
          ? referredBy.trim()
          : '';
      const adminOk =
        !!adminInviteCode &&
        typeof adminCode === 'string' &&
        adminCode === adminInviteCode;
      const refOk =
        ref.length > 0 && isValidReferral(db as DB, ref);

      if (!adminOk && !refOk) {
        return res.status(403).json({
          error:
            'INVITE_ONLY: valid referral or admin code required',
        });
      }

      if (!creator.referredBy && refOk) {
        creator.referredBy = ref;
      }
      creator.wallet = authWallet;
    } else {
      // bestehender Creator → Wallet muss matchen
      if (creator.wallet !== authWallet) {
        return res
          .status(403)
          .json({ error: 'Forbidden: wrong wallet' });
      }
    }

    // gemeinsame Felder updaten
    if (price !== undefined) {
      creator.price = Number(price) || 0;
    }
    if (replyWindowHours !== undefined) {
      creator.replyWindowHours =
        Number(replyWindowHours) || 48;
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
