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
      email: '',
      emailVerified: false,
      emailCode: uid(),
      banned: false,
      bio: '',
      statusText: '',
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
  const existing = (db.creators || {})[handle] || null;

  // Auth first
  const auth = await checkRequestAuth(req, { allowCookie: true });
  if (!auth.ok) return res.status(401).json({ error: auth.error || 'Unauthorized' });

  // Only allow creation/update for the authenticated wallet
  let creator = existing;
  if (!creator) {
    creator = ensureCreator(db as DB, handle);
  }

  // Wallet binding rules: if already bound, must match; if not bound, bind to signer
  if (creator.wallet && auth.wallet && creator.wallet !== auth.wallet) {
    return res.status(403).json({ error: 'Forbidden: wrong wallet' });
  }
  // prevent wallet reuse on other handles
  if (!creator.wallet && auth.wallet) {
    const other = Object.values<any>(db.creators || {}).find(
      (c: any) => c.wallet === auth.wallet && c.handle !== handle
    );
    if (other) {
      return res.status(409).json({ error: 'Wallet already bound to another handle', otherHandle: other.handle });
    }
  }
  if (!creator.wallet && auth.wallet) {
    creator.wallet = auth.wallet;
  }

  if (req.method === 'GET') {
    return res.json({
      handle: creator.handle,
      displayName: creator.displayName || '',
      avatarDataUrl: creator.avatarDataUrl || '',
      price: creator.price ?? 20,
      refCode: creator.refCode || null,
      replyWindowHours: creator.replyWindowHours ?? 48,
      email: creator.email || '',
      emailVerified: !!creator.emailVerified,
      statusText: creator.statusText || '',
      bio: creator.bio || '',
      banned: !!creator.banned,
      // Wallet geben wir in GET nicht zwingend raus
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
      email,
      banned,
      bio,
      statusText,
    } = (req.body ?? {}) as {
      price?: number | string;
      replyWindowHours?: number | string;
      displayName?: string;
      avatarDataUrl?: string;
      referredBy?: string | null;
      wallet?: string | null;
      email?: string;
      banned?: boolean;
      bio?: string;
      statusText?: string;
    };

    // 🧠 Ein Creator pro Wallet:
    if (typeof wallet === 'string' && wallet.trim().length > 0) {
      const newWallet = wallet.trim();

      // Prüfen, ob diese Wallet schon bei einem anderen Handle hängt
      const already = Object.values((db as DB).creators).find(
        (c: any) => c.wallet === newWallet && c.handle !== handle
      );

      if (already) {
        return res.status(409).json({
          error: 'Wallet already bound to another handle',
          otherHandle: already.handle,
        });
      }

      // Wenn dieser Creator noch keine Wallet hat → binden
      if (!creator.wallet) {
        creator.wallet = newWallet;
      } else if (creator.wallet !== newWallet) {
        // Falls hier schon eine andere drin ist → Fehler
        return res.status(403).json({ error: 'Forbidden: wallet mismatch' });
      }
    }

    if (price !== undefined) creator.price = Number(price) || 0;
    if (replyWindowHours !== undefined) creator.replyWindowHours = Number(replyWindowHours) || 48;
    if (typeof displayName === 'string') creator.displayName = displayName.trim();

    if (typeof avatarDataUrl === 'string' && avatarDataUrl.startsWith('data:image/')) {
      const approxSize = avatarDataUrl.length * 0.75;
      if (approxSize < 500 * 1024) creator.avatarDataUrl = avatarDataUrl;
    }

    if (!creator.referredBy && typeof referredBy === 'string' && referredBy.trim().length > 0) {
      creator.referredBy = referredBy.trim();
    }

    if (typeof email === 'string' && email.trim().length > 3 && email.includes('@')) {
      const cleanEmail = email.trim();
      if (cleanEmail !== creator.email) {
        creator.email = cleanEmail;
        creator.emailVerified = false;
        creator.emailCode = uid();
      }
    }

    if (typeof bio === 'string') creator.bio = bio.slice(0, 300);
    if (typeof statusText === 'string') creator.statusText = statusText.slice(0, 140);

    if (typeof banned === 'boolean') {
      creator.banned = banned;
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
