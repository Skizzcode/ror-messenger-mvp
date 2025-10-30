// pages/api/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { readDB } from '../../../lib/db';

// no explicit apiVersion -> use installed version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { creator, ttlHours = 48, firstMessage, ref } = req.body || {};
  if (!creator || !firstMessage) {
    return res.status(400).json({ error: 'Missing creator or firstMessage' });
  }

  // load creator to get real price
  const db = await readDB();
  const ce = db.creators?.[creator];
  const displayName = ce?.displayName || creator;
  const price = Math.max(1, Number(ce?.price ?? 20)); // EUR
  const amountInCents = Math.round(price * 100);

  // build origin for success/cancel
  const origin =
    (req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : 'https') +
    '://' +
    (req.headers['x-forwarded-host'] || req.headers.host);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amountInCents,
            product_data: {
              name: `Chat with ${displayName}`,
              description: `Reply window: ${ttlHours}h`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        creator,
        ttlHours: String(ttlHours),
        firstMessage,
        ref: ref || '',
      },
      success_url: `${origin}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
    });

    return res.json({ url: session.url });
  } catch (e: any) {
    console.error('Stripe session error', e);
    return res.status(500).json({ error: 'Stripe error' });
  }
}
