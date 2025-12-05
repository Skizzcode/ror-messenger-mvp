// pages/api/checkout/tip.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { readDB, writeDB } from '../../../lib/db';

function getOrigin(req: NextApiRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const origin =
    (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : (req.headers.origin as string) || 'http://localhost:3000';
  return origin.replace(/\/+$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { threadId, creator, amount } = req.body || {};
  if (!threadId || !creator || !amount) {
    return res.status(400).json({ error: 'Missing threadId, creator, or amount' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  const stripe = new Stripe(stripeSecret as string);
  const origin = getOrigin(req);

  try {
    const unitAmount = Math.max(1, Math.round(Number(amount) * 100));
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: unitAmount,
            product_data: {
              name: `Tip for @${creator}`,
              description: `Tip on thread ${threadId.slice(0, 8)}…`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: {
        type: 'tip',
        threadId,
        creator,
        source: 'ror',
      },
    });

    // Optional: mark tip intent in DB for UX hints
    const db = await readDB();
    (db as any).tips = (db as any).tips || {};
    (db as any).tipsPending = (db as any).tipsPending || {};
    (db as any).tipsPending[session.id] = { threadId, creator, amount, createdAt: Date.now() };
    await writeDB(db);

    return res.json({ url: session.url });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Stripe session error' });
  }
}
