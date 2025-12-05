// pages/api/checkout/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { readDB, writeDB } from '../../../lib/db';
import { track } from '../../../lib/telemetry';
import { sendNewThreadEmail } from '../../../lib/mail';

// Wichtig: Raw-Body fuer Stripe-Signatur
export const config = { api: { bodyParser: false } };

// Stripe-Client (ohne apiVersion -> nutzt die Lib-Default-Version; vermeidet TS-Konflikte)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Hilfsfunktion: gesamten Request-Body in ein Buffer lesen (ohne 'micro')
async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  // @ts-ignore - req ist ein Readable
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'] as string | undefined;

    if (endpointSecret && sig) {
      // Verifizierter Webhook
      event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
    } else {
      // Dev-Fallback (unsigniert)
      event = JSON.parse(raw.toString());
    }
  } catch (err: any) {
    await track({
      event: 'chat_started',
      scope: 'system',
      meta: { error: 'webhook_construct_failed', detail: err?.message },
    });
    return res.status(400).send(`Webhook Error: ${err?.message || 'invalid payload'}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};

      // Tip flow
      if (meta.type === 'tip') {
        const threadId = (meta.threadId as string) || '';
        const creator = (meta.creator as string) || '';
        const amount = (session.amount_total || 0) / 100;
        if (threadId) {
          const db = await readDB();
          (db as any).tips = (db as any).tips || {};
          if (!Array.isArray((db as any).tips[threadId])) (db as any).tips[threadId] = [];
          (db as any).tips[threadId].push({
            amount,
            sessionId: session.id,
            payment_intent: session.payment_intent || null,
            ts: Date.now(),
          });
          if ((db as any).tipsPending) delete (db as any).tipsPending[session.id];
          await writeDB(db);
          await track({
            event: 'tip_completed',
            scope: 'system',
            handle: creator,
            threadId,
            meta: { paid_via: 'stripe', sessionId: (session.id as string) || null },
          });
        }
        return res.status(200).json({ received: true });
      }

      // Erwartete Metadaten (vom Checkout erstellt)
      const creator = (meta.creator as string) || 'unknown';
      const fan = (meta.fanHint as string) || (meta.fan_hint as string) || 'stripe_user';
      const amount = (session.amount_total || 0) / 100;
      const ttlHours = Number(meta.ttlHours ?? meta.ttl_hours ?? 24);
      const ref = meta.ref || null;
      const firstMessage = (meta.firstMessage as string) ?? (meta.first_message as string) ?? '';

      const db = await readDB();
      const id = `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      const deadline = now + ttlHours * 60 * 60 * 1000;

      if (!db.threads) db.threads = {} as any;
      if (!db.messages) db.messages = {} as any;
      if (!db.escrows) db.escrows = {} as any;
      if (!db.checkouts) db.checkouts = {} as any;

      db.threads[id] = {
        id,
        creator,
        fan,
        amount,
        createdAt: now,
        deadline,
        status: 'open',
        paid_via: 'stripe',
        ref,
        fan_pubkey: null,      // Fan kann spaeter Wallet binden
        creator_pubkey: null,
        payment_intent: session.payment_intent || null,
        checkout_session: session.id,
        variant: meta.variant || 'standard',
        discountPercent: meta.discountPercent || '',
        offerId: meta.offerId || '',
        offerTitle: meta.offerTitle || '',
      };

      db.messages[id] = [];
      if (firstMessage) {
        db.messages[id].push({
          id: `m_${now.toString(36)}`,
          threadId: id,
          from: 'fan',
          body: String(firstMessage),
          ts: now,
        });
      }

      db.escrows[id] = {
        status: 'locked',
        until: deadline,
        source: 'stripe',
      };

      // Checkout-Status aktualisieren (Success-Page kann dadurch Thread-Link anzeigen)
      db.checkouts[session.id] = {
        ...(db.checkouts[session.id] || {}),
        status: 'completed',
        creator,
        firstMessage,
        amount,
        ttlHours,
        ref,
        threadId: id,
        fan,
        completedAt: now,
        payment_intent: session.payment_intent || null,
      };

      await writeDB(db);

      // Notify creator via email if verified
      const creatorEntry = (db.creators || {})[creator];
      if (creatorEntry?.email && creatorEntry?.emailVerified) {
        await sendNewThreadEmail({
          creator,
          email: creatorEntry.email,
          threadId: id,
          amount,
        });
      }

      await track({
        event: 'chat_started',
        scope: 'system',
        handle: creator,
        threadId: id,
        meta: { paid_via: 'stripe', sessionId: (session.id as string) || null },
      });
    }

    return res.status(200).json({ received: true });
  } catch (e: any) {
    await track({
      event: 'chat_started',
      scope: 'system',
      meta: { error: 'webhook_handler_failed', detail: e?.message },
    });
    return res.status(500).json({ ok: false });
  }
}
