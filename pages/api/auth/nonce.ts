// pages/api/auth/nonce.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';
import { uid } from '../../../lib/db';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const wallet = String(req.query.wallet || '').trim();
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });

  const nonce = uid(); // zufällig & ausreichend lang
  const key = `ror:auth:nonce:${wallet}:${nonce}`;

  // 2 Minuten gültig
  // @ts-ignore types may not include options; Upstash supports { ex: seconds }
  await redis.set(key, '1', { ex: 120 });

  return res.json({ wallet, nonce, expiresInSec: 120 });
}
