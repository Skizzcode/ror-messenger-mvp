// lib/rate.ts
import type { NextApiRequest } from 'next';

const bucket: Record<string, { t: number; c: number }> = {};

export function basicLimiter(req: NextApiRequest, opts: { maxPerMin: number }): boolean {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    const key = `${ip}:${req.url?.split('?')[0]}`;
    const now = Date.now();
    const win = 60 * 1000;
    const hit = bucket[key] || { t: now, c: 0 };
    if (now - hit.t > win) { hit.t = now; hit.c = 0; }
    hit.c++;
    bucket[key] = hit;
    return hit.c <= opts.maxPerMin;
  } catch {
    return true; // fail open in MVP
  }
}
