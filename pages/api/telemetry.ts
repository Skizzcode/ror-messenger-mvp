// pages/api/telemetry.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function dayKey(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { event, scope = 'global', props = {} } = (req.body || {}) as {
    event?: string; scope?: string; props?: Record<string, any>;
  };
  if (!event || typeof event !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing event' });
  }

  const now = new Date();
  const dkey = dayKey(now);
  const base = `ror:telemetry:v1`;

  // Tageszähler
  const countKey = `${base}:count:${event}:${dkey}`;
  await redis.hincrby(countKey, 'total', 1);
  await redis.hincrby(countKey, scope, 1);
  await redis.expire(countKey, 60 * 24 * 60 * 60);

  // Rolling Log (letzte 500)
  const logKey = `${base}:log`;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  await redis.lpush(logKey, JSON.stringify({ ts: now.toISOString(), event, scope, props, ip, ua }));
  await redis.ltrim(logKey, 0, 499);

  return res.json({ ok: true });
}
