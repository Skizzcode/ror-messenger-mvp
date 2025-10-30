// pages/api/refund-cron.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../lib/db';
import { refundEscrow } from '../../lib/escrow';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const db = await readDB();
  const now = Date.now();
  const refunded: string[] = [];

  const threads = db.threads || {};
  for (const [id, th] of Object.entries<any>(threads)) {
    if (th?.status === 'open' && typeof th.deadline === 'number' && th.deadline <= now) {
      try {
        // v1: Stub -> später on-chain
        await refundEscrow({ threadId: id });
      } catch {
        // MVP: ignore errors, still mark refunded
      }
      th.status = 'refunded';
      th.refundedAt = now;
      refunded.push(id);
    }
  }

  await writeDB(db);
  return res.json({ ok: true, count: refunded.length, refunded });
}
