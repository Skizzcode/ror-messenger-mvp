import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, type DB } from '../../lib/db';
import { checkRequestAuth } from '../../lib/auth';
import { sendVerificationEmail } from '../../lib/mail';

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
    email,
  } = (req.body || {}) as {
    handle?: string;
    displayName?: string;
    price?: number;
    replyWindowHours?: number;
    avatarDataUrl?: string | null;
    ref?: string | null;
    email?: string | null;
  };

  const cleanHandle = String(handle || '').trim().toLowerCase();
  if (!cleanHandle || !/^[a-z0-9-_]{2,}$/.test(cleanHandle)) {
    return res.status(400).json({ error: 'Invalid handle' });
  }

  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length < 5) {
    return res.status(400).json({ error: 'Email required' });
  }

  const inviteOnly = String(process.env.INVITE_ONLY ?? 'true').toLowerCase() !== 'false';

  // Invite-only: valid ref required unless toggled off
  const db = await readDB();
  ensureCreatorsMap(db as DB);
  const creators = (db as DB).creators;

  const refOwner = ref ? Object.values<any>(creators).find((c: any) => c?.refCode === ref) : null;
  if (inviteOnly && (!ref || !refOwner)) {
    return res.status(403).json({ error: 'Invite required (invalid referral code)' });
  }

  if (refOwner && refOwner.handle === cleanHandle) {
    return res.status(400).json({ error: 'SELF_REFERRAL_FORBIDDEN' });
  }

  if (creators[cleanHandle]) {
    return res.status(409).json({ error: 'Handle already taken' });
  }

  // 🔒 Owner => the signer becomes the bound wallet for this creator
  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ error: auth.error || "UNAUTHORIZED" });

  const already = Object.values<any>(creators).find((c: any) => c.wallet === auth.wallet);
  if (already) {
    return res.status(409).json({ error: "Wallet already bound to another handle", otherHandle: already.handle });
  }

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
    email: cleanEmail,
    emailVerified: false,
    emailCode: Math.random().toString(36).slice(2, 10),
    banned: false,
    bio: '',
    statusText: '',
  };

  const entry = creators[cleanHandle];
  entry.displayName = typeof displayName === 'string' ? displayName.trim() : (entry.displayName || '');
  if (typeof price === 'number') entry.price = price;
  if (typeof replyWindowHours === 'number') entry.replyWindowHours = replyWindowHours;
  entry.email = cleanEmail;

  if (typeof avatarDataUrl === 'string' && avatarDataUrl.startsWith('data:image/')) {
    const approxSize = avatarDataUrl.length * 0.75;
    if (approxSize < 500 * 1024) entry.avatarDataUrl = avatarDataUrl;
  }

  // bind wallet to signer
  entry.wallet = auth.wallet!;

  await writeDB(db);
  if (entry.email && entry.emailCode) {
    await sendVerificationEmail(cleanHandle, entry.email, entry.emailCode);
  }

  return res.json({ ok: true, handle: cleanHandle, verificationCode: entry.emailCode || null });
}

