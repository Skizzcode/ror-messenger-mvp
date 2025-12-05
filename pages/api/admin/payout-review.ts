// pages/api/admin/payout-review.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';
import Stripe from 'stripe';

function getBaseUrl(req: NextApiRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const origin =
    (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : (req.headers.origin as string) || 'http://localhost:3000';
  return origin.replace(/\/+$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { threadId, action } = (req.body || {}) as { threadId?: string; action?: 'release' | 'refund' };
  if (!threadId || !action) return res.status(400).json({ ok: false, error: 'BAD_INPUT' });

  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  if (!isAdminWallet(auth.wallet)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const db = await readDB();
  const thread = (db.threads || {})[threadId];
  if (!thread) return res.status(404).json({ ok: false, error: 'THREAD_NOT_FOUND' });
  if (!db.escrows) db.escrows = {} as any;

  const escrow = db.escrows[threadId] || {};
  if (!['hold_review', 'payout_failed'].includes(escrow.status)) {
    return res.status(400).json({ ok: false, error: 'NOT_ON_HOLD' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
  const payoutErrors: any[] = [];
  let payoutNextAction: any = null;

  const markPayoutFailed = (reason: string, extra?: any) => {
    const currentEscrow = db.escrows[threadId] || escrow;
    payoutErrors.push(reason);
    const history = Array.isArray((currentEscrow as any).payoutErrors) ? (currentEscrow as any).payoutErrors : [];
    db.escrows[threadId] = {
      ...currentEscrow,
      status: 'payout_failed',
      payoutErrors: Array.from(new Set([...history, reason])),
      payoutLastError: reason,
      payoutLastErrorAt: Date.now(),
      payoutNextAction: extra || null,
      attemptedReleaseBy: auth.wallet,
      holdReviewedBy: auth.wallet,
    };
    payoutNextAction = extra || null;
  };

  if (action === 'refund') {
    thread.status = 'refunded';
    db.escrows[threadId] = { ...escrow, status: 'refunded', refundedAt: Date.now(), holdReviewedBy: auth.wallet };
    if (stripe && thread.paid_via === 'stripe' && thread.payment_intent) {
      try {
        await stripe.refunds.create({ payment_intent: String(thread.payment_intent), metadata: { threadId, reason: 'admin_refund_hold' } });
      } catch (e: any) {
        payoutErrors.push(e?.message || 'refund_failed');
      }
    }
  }

  if (action === 'release') {
    thread.status = 'answered';
    // Note: If transfer to Connect failed earlier, retry here
    if (!stripe) {
      markPayoutFailed('stripe_not_configured');
    } else if (thread.paid_via === 'stripe' && thread.creator) {
      const creator = (db.creators || {})[thread.creator];
      const dest = creator?.stripeAccountId;
      if (!dest) {
        markPayoutFailed('no_stripe_account');
      } else {
        // Check onboarding/requirements before trying the transfer
        let accountReady = true;
        try {
          const account = await stripe.accounts.retrieve(dest);
          const missing = account.requirements?.currently_due || [];
          accountReady = !!account.charges_enabled && !!account.payouts_enabled && missing.length === 0;
          if (!accountReady) {
            // Generate a fresh onboarding link to push the creator over the finish line
            const base = getBaseUrl(req);
            try {
              const link = await stripe.accountLinks.create({
                account: dest,
                refresh_url: `${base}/creator/${encodeURIComponent(thread.creator)}`,
                return_url: `${base}/creator/${encodeURIComponent(thread.creator)}`,
                type: 'account_onboarding',
              });
              payoutNextAction = {
                type: 'finish_onboarding',
                accountId: dest,
                onboardingUrl: link.url,
                missing,
              };
              markPayoutFailed('account_not_ready', payoutNextAction);
            } catch (linkErr: any) {
              markPayoutFailed('account_not_ready', {
                type: 'finish_onboarding',
                accountId: dest,
                missing,
                onboardingUrl: null,
                linkError: linkErr?.message || 'link_failed',
              });
            }
          }
        } catch (e: any) {
          accountReady = false;
          markPayoutFailed('account_lookup_failed', { error: e?.message || 'lookup_failed', accountId: dest });
        }

        if (accountReady) {
          try {
            // Attempt a transfer from platform balance to creator
            const amount = Math.round((thread.amount || 0) * 100);
            await stripe.transfers.create({
              amount,
              currency: 'eur',
              destination: dest,
              metadata: { threadId },
            });
            // Application fee was already taken on PI; if not, you need to handle separately.
            db.escrows[threadId] = {
              ...escrow,
              status: 'released',
              releasedAt: Date.now(),
              holdReviewedBy: auth.wallet,
              payoutErrors: [],
              payoutLastError: null,
              payoutNextAction: null,
            };
          } catch (e: any) {
            markPayoutFailed(e?.message || 'transfer_failed');
          }
        }
      }
    } else {
      markPayoutFailed('unsupported_paid_via');
    }
  }

  await writeDB(db);
  return res.status(200).json({
    ok: true,
    status: db.escrows[threadId]?.status,
    payoutErrors,
    payoutNextAction: payoutNextAction || db.escrows[threadId]?.payoutNextAction || null,
  });
}
