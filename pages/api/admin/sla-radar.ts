// pages/api/admin/sla-radar.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

/**
 * Returns open threads sorted by remaining time until deadline.
 * For admin ops radar: nudge creators before SLA miss.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) {
    return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  }
  if (!isAdminWallet(auth.wallet)) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  const db = await readDB();
  const now = Date.now();
  const threadsArr = Object.values<any>(db.threads || {})
    .filter((t: any) => t.status === 'open')
    .map((t: any) => {
      const remainingMs = Math.max(0, (t.deadline || 0) - now);
      return {
        id: t.id,
        creator: t.creator,
        fan: t.fan,
        amount: t.amount,
        status: t.status,
        deadline: t.deadline || null,
        createdAt: t.createdAt || null,
        remainingMs,
        remainingHours: Math.round((remainingMs / 3600000) * 10) / 10,
        paid_via: t.paid_via || null,
      };
    })
    .sort((a, b) => a.remainingMs - b.remainingMs);

  return res.status(200).json({ ok: true, count: threadsArr.length, threads: threadsArr });
}
