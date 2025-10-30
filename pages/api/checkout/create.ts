// pages/api/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getStripe } from '../../../lib/stripe';

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
  'http://localhost:3000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { creator, amount = 20, ttlHours = 48, firstMessage = '' } = req.body || {};
  if (!creator) return res.status(400).json({ error: 'Missing creator' });

  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(Number(amount) * 100),
          product_data: {
            name: `Reply or Refund • ${creator}`,
            description: 'Guaranteed reply or your money back',
          },
        },
      },
    ],
    // ganz wichtig: NICHT mehr localhost
    success_url: `${SITE}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/checkout/cancel`,
    metadata: {
      creator,
      amount,
      ttlHours,
      firstMessage,
    },
  });

  return res.json({ url: session.url });
}
