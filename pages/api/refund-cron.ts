// pages/api/refund-cron.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../lib/db';
import { track } from '../../lib/telemetry';
import Stripe from 'stripe';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const db = await readDB();
    const now = Date.now();
    const updated: string[] = [];
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
    const refundErrors: Array<{ threadId: string; error: string }> = [];

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

        // Stripe refund if applicable
        if (stripe && t.paid_via === 'stripe' && t.payment_intent) {
          try {
            await stripe.refunds.create({
              payment_intent: String(t.payment_intent),
              metadata: { threadId: id, reason: 'deadline' },
            });
          } catch (err: any) {
            refundErrors.push({ threadId: id, error: err?.message || 'refund_failed' });
          }
        }

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

    return res.status(200).json({ ok: true, refunded: updated.length, threads: updated, refundErrors });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e?.message });
  }
}
