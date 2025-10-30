// pages/api/create-thread.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB, uid } from '../../lib/db';
import { initEscrow } from '../../lib/escrow';
import { sha256Base58Server, verifyDetachedSig, extractTs } from '../../lib/verify';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    creator,
    fan,
    // amount is IGNORED now (authoritative = creator settings)
    ttlHours = 48,
    firstMessage,
    fanPubkey,
    creatorPubkey = null,
    // signing fields
    sigBase58,
    msg,
    pubkeyBase58,
    // optional: marketing ref from URL (fan ref)
    ref,
  } = req.body || {};

  if (!creator || !fan || !firstMessage) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!fanPubkey) return res.status(400).json({ error: 'Wallet required' });
  if (!sigBase58 || !msg || !pubkeyBase58) {
    return res.status(400).json({ error: 'Signature required' });
  }
  if (pubkeyBase58 !== fanPubkey) {
    return res.status(403).json({ error: 'Signature wallet mismatch' });
  }

  const bodyhash = sha256Base58Server(firstMessage);
  const expectedPrefix =
    `ROR|create-thread|creator=${creator}|fan=${fanPubkey}|bodyhash=${bodyhash}|ttl=${ttlHours}|ts=`;
  if (!msg.startsWith(expectedPrefix)) {
    return res.status(400).json({ error: 'Invalid message payload' });
  }
  const ts = extractTs(msg);
  if (!ts || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Expired/invalid timestamp' });
  }
  if (!verifyDetachedSig(msg, sigBase58, pubkeyBase58)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // DB
  const db = await readDB();
  db.threads = db.threads || {};
  db.messages = db.messages || {};
  db.escrows  = db.escrows  || {};
  db.creators = db.creators || {};

  // authoritative price from creator settings
  const creatorEntry = db.creators[creator] || null;
  const priceFromCreator = Math.max(1, Number(creatorEntry?.price ?? 20));
  const referredByCreatorCode = creatorEntry?.referredBy || null;
  const creatorDisplayName = creatorEntry?.displayName || null;
  const creatorAvatar = creatorEntry?.avatarDataUrl || null;

  const id = uid();
  const now = Date.now();

  db.threads[id] = {
    id,
    creator,
    fan,
    amount: priceFromCreator,
    createdAt: now,
    deadline: now + ttlHours * 3600 * 1000,
    status: 'open',
    fan_pubkey: fanPubkey,
    creator_pubkey: creatorPubkey,
    paid_via: 'wallet',
    referredByCreatorCode,
    creator_display_name: creatorDisplayName,
    creator_avatar: creatorAvatar,
    ref: ref || null,
  };

  db.messages[id] = [
    { id: uid(), threadId: id, from: 'fan', body: firstMessage, ts: now }
  ];

  try {
    const esc = await initEscrow({ threadId: id, amount: priceFromCreator, deadlineMs: ttlHours * 3600 * 1000 });
    db.escrows[id] = { status: esc.status, until: esc.until, source: 'wallet' };
  } catch { /* ignore in MVP */ }

  await writeDB(db);
  return res.json({ threadId: id });
}
