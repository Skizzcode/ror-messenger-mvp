// pages/api/payout-retry-cron.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { readDB, writeDB } from '../../lib/db';

/** Auto-retry payouts that previously failed (status = payout_failed). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return res.status(500).json({ ok: false, error: 'STRIPE_NOT_CONFIGURED' });
  }
  const stripe = new Stripe(stripeSecret);

  try {
    const db = await readDB();
    const escrows = db.escrows || {};
    const successes: Array<{ threadId: string }> = [];
    const failures: Array<{ threadId: string; error: string; nextAction?: any }> = [];

    for (const [threadId, escrow] of Object.entries<any>(escrows)) {
      if (escrow?.status !== 'payout_failed') continue;

      const thread = (db.threads || {})[threadId];
      if (!thread || thread.paid_via !== 'stripe') continue;

      const creator = (db.creators || {})[thread.creator];
      const dest = creator?.stripeAccountId;
      if (!dest) {
        failures.push({ threadId, error: 'no_stripe_account' });
        continue;
      }

      // Check account readiness
      let ready = false;
      let nextAction: any = null;
      try {
        const account = await stripe.accounts.retrieve(dest);
        const missing = account.requirements?.currently_due || [];
        ready = !!account.charges_enabled && !!account.payouts_enabled && missing.length === 0;
        if (!ready) {
          // provide a fresh onboarding link to finish requirements
          const origin =
            (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
              ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
              : (req.headers.origin as string) || (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
          try {
            const link = await stripe.accountLinks.create({
              account: dest,
              refresh_url: origin.replace(/\/+$/, '') + `/creator/${encodeURIComponent(thread.creator)}`,
              return_url: origin.replace(/\/+$/, '') + `/creator/${encodeURIComponent(thread.creator)}`,
              type: 'account_onboarding',
            });
            nextAction = { type: 'finish_onboarding', accountId: dest, missing, onboardingUrl: link.url };
          } catch (linkErr: any) {
            nextAction = {
              type: 'finish_onboarding',
              accountId: dest,
              missing,
              onboardingUrl: null,
              linkError: linkErr?.message || 'link_failed',
            };
          }
          failures.push({ threadId, error: 'account_not_ready', nextAction });
          db.escrows[threadId] = {
            ...(db.escrows[threadId] || {}),
            status: 'payout_failed',
            payoutLastError: 'account_not_ready',
            payoutErrors: Array.from(new Set([...(escrow.payoutErrors || []), 'account_not_ready'])),
            payoutNextAction: nextAction,
            payoutLastErrorAt: Date.now(),
          };
          continue;
        }
      } catch (e: any) {
        failures.push({ threadId, error: e?.message || 'account_lookup_failed' });
        db.escrows[threadId] = {
          ...(db.escrows[threadId] || {}),
          status: 'payout_failed',
          payoutLastError: 'account_lookup_failed',
          payoutErrors: Array.from(new Set([...(escrow.payoutErrors || []), 'account_lookup_failed'])),
          payoutLastErrorAt: Date.now(),
        };
        continue;
      }

      // Attempt transfer
      if (ready) {
        try {
          const amount = Math.round((thread.amount || 0) * 100);
          await stripe.transfers.create({
            amount,
            currency: 'eur',
            destination: dest,
            metadata: { threadId, source: 'payout_retry_cron' },
          });

          db.escrows[threadId] = {
            ...(db.escrows[threadId] || {}),
            status: 'released',
            releasedAt: Date.now(),
            payoutErrors: [],
            payoutLastError: null,
            payoutNextAction: null,
            autoReleasedBy: 'payout-retry-cron',
          };
          // thread should already be answered; keep status but ensure not refunded
          if (thread.status === 'open') {
            thread.status = 'answered';
          }
          successes.push({ threadId });
        } catch (e: any) {
          const reason = e?.message || 'transfer_failed';
          failures.push({ threadId, error: reason });
          db.escrows[threadId] = {
            ...(db.escrows[threadId] || {}),
            status: 'payout_failed',
            payoutLastError: reason,
            payoutErrors: Array.from(new Set([...(escrow.payoutErrors || []), reason])),
            payoutLastErrorAt: Date.now(),
          };
        }
      }
    }

    if (successes.length || failures.length) {
      await writeDB(db);
    }

    return res.status(200).json({
      ok: true,
      attempted: successes.length + failures.length,
      released: successes.length,
      failed: failures,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e?.message });
  }
}
