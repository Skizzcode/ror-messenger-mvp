// pages/api/admin/export.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../../lib/db';
import { checkRequestAuth } from '../../../lib/auth';
import { isAdminWallet } from '../../../lib/admin';

function toCsv(rows: any[], headers: string[]) {
  const esc = (v: any) => {
    const s = v === undefined || v === null ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).send('METHOD_NOT_ALLOWED');

  const auth = await checkRequestAuth(req, { allowCookie: false });
  if (!auth.ok || !auth.wallet) return res.status(401).json({ ok: false, error: auth.error || 'UNAUTHORIZED' });
  if (!isAdminWallet(auth.wallet)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const format = String(req.query.format || 'json').toLowerCase();
  const type = String(req.query.type || 'creators').toLowerCase();
  const db = await readDB();

  const creators = Object.values<any>(db.creators || {});
  const threads = Object.values<any>(db.threads || {});
  const audit = Array.isArray((db as any).audit) ? (db as any).audit : [];
  const messages = db.messages || {};

  if (format === 'csv') {
    if (type === 'creators') {
      const headers = ['handle', 'wallet', 'email', 'price', 'replyWindowHours', 'refCode', 'referredBy', 'banned'];
      const rows = creators.map((c: any) => ({
        handle: c.handle,
        wallet: c.wallet || '',
        email: c.email || '',
        price: c.price ?? '',
        replyWindowHours: c.replyWindowHours ?? '',
        refCode: c.refCode || '',
        referredBy: c.referredBy || '',
        banned: c.banned ? 'true' : 'false',
      }));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="creators.csv"');
      return res.status(200).send(toCsv(rows, headers));
    }

    if (type === 'threads') {
      const headers = ['id', 'creator', 'fan', 'amount', 'status', 'createdAt', 'answeredAt', 'refundedAt', 'paid_via', 'ref'];
      const rows = threads.map((t: any) => ({
        id: t.id,
        creator: t.creator,
        fan: t.fan,
        amount: t.amount,
        status: t.status,
        createdAt: t.createdAt || '',
        answeredAt: t.answeredAt || '',
        refundedAt: t.refundedAt || '',
        paid_via: t.paid_via || '',
        ref: t.ref || '',
      }));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="threads.csv"');
      return res.status(200).send(toCsv(rows, headers));
    }

    if (type === 'invoices' || type === 'accounting') {
      const headers = [
        'threadId',
        'creatorHandle',
        'creatorWallet',
        'fanWallet',
        'amount',
        'currency',
        'status',
        'paid_via',
        'refCode',
        'createdAt',
        'answeredAt',
        'refundedAt',
        'messagesCount',
      ];
      const rows = threads.map((t: any) => {
        const creator = (db.creators || {})[t.creator] || {};
        const msgs = Array.isArray(messages[t.id]) ? messages[t.id] : [];
        return {
          threadId: t.id,
          creatorHandle: t.creator,
          creatorWallet: creator.wallet || '',
          fanWallet: t.fan || t.fan_pubkey || '',
          amount: t.amount,
          currency: 'EUR', // UI is priced in EUR / USDC-equiv
          status: t.status,
          paid_via: t.paid_via || '',
          refCode: t.ref || '',
          createdAt: t.createdAt || '',
          answeredAt: t.answeredAt || '',
          refundedAt: t.refundedAt || '',
          messagesCount: msgs.length || 0,
        };
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=\"invoices.csv\"');
      return res.status(200).send(toCsv(rows, headers));
    }

    if (type === 'audit') {
      const headers = ['ts', 'kind', 'actor', 'detail'];
      const rows = audit.map((a: any) => ({
        ts: a.ts,
        kind: a.kind,
        actor: a.actor,
        detail: a.detail ? JSON.stringify(a.detail) : '',
      }));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit.csv"');
      return res.status(200).send(toCsv(rows, headers));
    }
  }

  // default JSON
  return res.status(200).json({
    ok: true,
    creators,
    threads,
    audit,
    messages,
  });
}
