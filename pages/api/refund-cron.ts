// pages/api/refund-cron.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../lib/db';
import { track } from '../../lib/telemetry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const db = await readDB();
    const now = Date.now();
    const updated: string[] = [];

    for (const [id, t] of Object.entries<any>(db.threads || {})) {
      if (t.status === 'open' && typeof t.deadline === 'number' && t.deadline < now) {
        t.status = 'refunded';
        if (!db.escrows) db.escrows = {} as any;
        db.escrows[id] = {
          ...(db.escrows[id] || {}),
          status: 'refunded',
          refundedAt: now,
        };
        updated.push(id);

        await track({
          event: 'refund_triggered',
          scope: 'system',
          handle: t.creator,
          threadId: id,
          meta: { reason: 'deadline' },
        });
      }
    }

    if (updated.length) await writeDB(db);

    return res.status(200).json({ ok: true, refunded: updated.length, threads: updated });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e?.message });
  }
}
