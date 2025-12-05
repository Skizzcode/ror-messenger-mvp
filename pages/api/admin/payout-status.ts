// pages/api/admin/payout-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  if (!isAdminWallet(auth.wallet)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const db = await readDB();
  const items = Object.entries<any>(db.escrows || {}).map(([threadId, esc]) => {
    const t = (db.threads || {})[threadId];
    return {
      threadId,
      status: esc?.status || null,
      creator: t?.creator || null,
      amount: t?.amount || null,
      paid_via: t?.paid_via || null,
      payoutNextAction: esc?.payoutNextAction || null,
      payoutLastError: esc?.payoutLastError || null,
      payoutErrors: esc?.payoutErrors || [],
      updatedAt: esc?.payoutLastErrorAt || esc?.releasedAt || esc?.refundedAt || null,
    };
  });

  const payoutFailed = items.filter((i) => i.status === 'payout_failed');
  const holds = items.filter((i) => i.status === 'hold_review');

  return res.status(200).json({
    ok: true,
    payoutFailed,
    holdReview: holds,
    total: items.length,
  });
}
