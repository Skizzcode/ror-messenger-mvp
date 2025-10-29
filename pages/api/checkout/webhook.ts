// pages/api/checkout/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getStripe, STRIPE_WEBHOOK_SECRET } from '../../../lib/stripe';
import { readDB, writeDB, uid } from '../../../lib/db';
import { initEscrow } from '../../../lib/escrow';

export const config = {
  api: { bodyParser: false } // wichtig: raw body für Stripe-Signatur
};

function buffer(readable: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on('data', (chunk: Buffer) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const stripe = getStripe();

  // 1) Raw Body + Verify
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'] as string;
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verify failed', err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // 2) Handle event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const md = session.metadata || {};
    const creator = String(md.creator || 'unknown');
    const amount = Number(md.amount || 20);
    const ttlHours = Number(md.ttlHours || 48);
    const firstMessage = String(md.firstMessage || '');

    // ⬇️ async DB read
    const db = await readDB();

    // defensive init
    db.threads = db.threads || {};
    db.messages = db.messages || {};
    db.escrows = db.escrows || {};
    (db as any).checkouts = (db as any).checkouts || {};

    // create thread
    const threadId = uid();
    const now = Date.now();
    const fanId = `fan-stripe-${session.customer || session.customer_email || 'anon'}`;

    db.threads[threadId] = {
      id: threadId,
      creator,
      fan: fanId,
      amount,
      createdAt: now,
      deadline: now + ttlHours * 3600 * 1000,
      status: 'open',
      fan_pubkey: null,
      creator_pubkey: null,
      paid_via: 'stripe',
      stripe_session_id: session.id
    };

    db.messages[threadId] = [
      { id: uid(), threadId, from: 'fan', body: firstMessage, ts: now }
    ];

    // escrow stub
    try {
      const esc = await initEscrow({ threadId, amount, deadlineMs: ttlHours * 3600 * 1000 });
      db.escrows[threadId] = { status: esc.status, until: esc.until, source: 'stripe' };
    } catch {
      // ignore in MVP
    }

    // map checkout session -> thread
    (db as any).checkouts[session.id] = { threadId, creator, amount, createdAt: now };

    // ⬇️ async DB write
    await writeDB(db);
  }

  return res.json({ received: true });
}
