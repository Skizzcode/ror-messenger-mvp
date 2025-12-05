// pages/api/stripe/connect-link.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { readDB, writeDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  const handle = (req.query.handle as string | undefined)?.trim().toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const auth = await checkRequestAuth(req, { allowCookie: true });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ error: auth.error || 'UNAUTHORIZED' });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return res.status(500).json({ error: 'STRIPE_NOT_CONFIGURED' });
  const stripe = new Stripe(stripeSecret);

  const db = await readDB();
  const creator = (db.creators || {})[handle];
  if (!creator) return res.status(404).json({ error: 'CREATOR_NOT_FOUND' });
  if (creator.wallet && creator.wallet !== auth.wallet) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  // Create account if missing
  let accountId = creator.stripeAccountId as string | undefined;
  if (!accountId) {
    const country = process.env.STRIPE_CONNECT_COUNTRY || 'DE';
    const acct = await stripe.accounts.create({
      type: 'express',
      country,
      email: creator.email || undefined,
      metadata: { handle },
    });
    accountId = acct.id;
    (creator as any).stripeAccountId = accountId;
    db.creators[handle] = creator;
    await writeDB(db);
  }

  const origin = getBaseUrl(req);
  const returnUrl = `${origin}/creator/${encodeURIComponent(handle)}`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return res.status(200).json({ ok: true, url: link.url, accountId });
}
