// pages/api/telemetry/today.ts
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
  // Optional: simple shared secret via query ?k=...
  const k = (req.query.k as string) || '';
  if (process.env.TELEMETRY_DEBUG_KEY && k !== process.env.TELEMETRY_DEBUG_KEY) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const day = dayKey();
  const base = 'ror:telemetry:v1:count';
  // Welche Events wollen wir lesen?
  const events = [
    'page_view',
    'checkout_started',
    'thread_created',
    'message_sent',
    'creator_joined',
  ];

  const out: Record<string, any> = {};
  for (const ev of events) {
    const key = `${base}:${ev}:${day}`;
    const obj = await redis.hgetall<Record<string, number>>(key);
    if (obj) out[ev] = obj;
  }

  return res.json({ ok: true, day, counts: out });
}
