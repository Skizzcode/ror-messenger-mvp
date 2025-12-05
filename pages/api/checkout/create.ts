// pages/api/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../../lib/db';
import Stripe from 'stripe';

function getOrigin(req: NextApiRequest): string {
  // bevorzugt oeffentlich konfiguriert
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');
  // fallback: aus Request-Header
  const origin =
    (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : (req.headers.origin as string) || 'http://localhost:3000';
  return origin.replace(/\/+$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    creator,           // handle (string) -> Pflicht
    firstMessage,      // erste Fan-Nachricht -> Pflicht
    amount,            // optional (wird von Creator-Settings ueberschrieben, wenn vorhanden)
    ttlHours,          // optional (wird ueberschrieben, wenn Creator-Setting vorhanden)
    ref,               // optional referral-code
  } = req.body || {};

  if (!creator || !firstMessage) {
    return res.status(400).json({ error: 'Missing creator or firstMessage' });
  }

  // 1) DB lesen und Creator-Settings ziehen
  const db = await readDB();
  const c = (db.creators || {})[creator] || null;

  // Ref-Self-Check
  const safeRef = ref && c?.refCode === ref ? null : ref || null;

  // 2) Preis & Reply-Fenster priorisieren: Creator-Settings > Body > Defaults
  const priceNumber =
    typeof c?.price === 'number' && c.price > 0
      ? c.price
      : typeof amount === 'number' && amount > 0
      ? amount
      : 20;

  const replyWindowHours =
    typeof c?.replyWindowHours === 'number' && c.replyWindowHours > 0
      ? c.replyWindowHours
      : typeof ttlHours === 'number' && ttlHours > 0
      ? ttlHours
      : 48;

  // 3) Stripe-Session bauen
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  const stripe = new Stripe(stripeSecret as string);

  const origin = getOrigin(req);

  // Cent-Betrag
  const unitAmount = Math.round(priceNumber * 100);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: unitAmount,
            product_data: {
              name: `Paid DM to @${creator}`,
              description: `Reply window: ${replyWindowHours}h`,
            },
          },
          quantity: 1,
        },
      ],
      // Nach dem Bezahlen zurueck -> dein Success-/Cancel-Flow
      success_url: `${origin}/checkout/success?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      // Metadata fuer den Webhook
      metadata: {
        creator,               // handle
        firstMessage,          // erste Nachricht
        ttlHours: String(replyWindowHours),
        ref: safeRef || '',
        source: 'ror',
      },
    });

    // 4) Checkout-Vormerkung in DB
    db.checkouts = db.checkouts || {};
    db.checkouts[session.id] = {
      status: 'created',
      creator,
      firstMessage,
      amount: priceNumber,
      ttlHours: replyWindowHours,
      ref: safeRef,
      createdAt: Date.now(),
    };
    await writeDB(db);

    return res.json({ url: session.url });
  } catch (e: any) {
    console.error('Stripe checkout create failed:', e?.message || e);
    return res.status(500).json({ error: 'Stripe session error' });
  }
}
