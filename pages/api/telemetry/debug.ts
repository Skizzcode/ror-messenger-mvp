// pages/api/telemetry/debug.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Optional: simple shared secret via query ?k=...
  const k = (req.query.k as string) || '';
  if (process.env.TELEMETRY_DEBUG_KEY && k !== process.env.TELEMETRY_DEBUG_KEY) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const lines = await redis.lrange('ror:telemetry:v1:log', 0, 99);
  const parsed = lines.map((s) => {
    try { return JSON.parse(String(s)); } catch { return { raw: s }; }
  });
  return res.json({ ok: true, count: parsed.length, events: parsed });
}
