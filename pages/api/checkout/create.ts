// pages/api/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getStripe, NEXT_PUBLIC_BASE_URL } from '../../../lib/stripe';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { creator, amount = 20, ttlHours = 48, firstMessage } = req.body || {};
  if (!creator || !firstMessage) return res.status(400).json({ error: 'Missing fields' });

  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'], // Apple/Google Pay wird automatisch unterstützt
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: `Direct Reply from @${creator}` },
          unit_amount: Math.max(100, Math.round(Number(amount) * 100)), // min 1€
        },
        quantity: 1,
      },
    ],
    success_url: `${NEXT_PUBLIC_BASE_URL}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${NEXT_PUBLIC_BASE_URL}/checkout/cancel`,
    metadata: {
      creator,
      amount: String(amount),
      ttlHours: String(ttlHours),
      firstMessage, // wird im Webhook in den Thread geschrieben
    },
  });

  return res.json({ url: session.url });
}
