// pages/api/message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../lib/db';
import * as Verify from '../../lib/verify';
import { track } from '../../lib/telemetry';
import { apiErr, apiOk } from '../../lib/api';

const DRIFT_MS = 5 * 60 * 1000;

async function verifySig(params: { msg: string; sigBase58: string; pubkeyBase58: string }) {
  const v: any = Verify;
  const candidates = [
    v.verifyServerSignature,
    v.verifySignature,
    v.verify,
    v.default?.verifyServerSignature,
    v.default?.verifySignature,
    v.default?.verify,
  ].filter((fn) => typeof fn === 'function');

  for (const fn of candidates) {
    const res = await fn(params);
    if (typeof res === 'boolean') return res;
  }
  throw new Error('VERIFY_FN_NOT_FOUND');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return apiErr(req, res, 405, 'METHOD_NOT_ALLOWED');

  try {
    const { threadId, from, body, sigBase58, msg, pubkeyBase58 } = req.body || {};
    if (!threadId || !from || !body || !sigBase58 || !msg || !pubkeyBase58) {
      return apiErr(req, res, 400, 'BAD_REQUEST');
    }
    if (!String(msg).startsWith('ROR|message|')) {
      return apiErr(req, res, 400, 'BAD_PREFIX');
    }
    const tsPart = String(msg).split('|').pop();
    const ts = Number(tsPart?.includes('ts=') ? tsPart.split('ts=').pop() : tsPart);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DRIFT_MS) {
      return apiErr(req, res, 400, 'TS_DRIFT');
    }

    const ok = await verifySig({ msg, sigBase58, pubkeyBase58 });
    if (!ok) return apiErr(req, res, 401, 'BAD_SIGNATURE');

    const db = await readDB();
    const thread = db.threads?.[threadId];
    if (!thread) return apiErr(req, res, 404, 'THREAD_NOT_FOUND');

    if (from === 'fan') {
      if (thread.fan_pubkey && thread.fan_pubkey !== pubkeyBase58) {
        return apiErr(req, res, 403, 'WALLET_MISMATCH', { role: 'fan' });
      }
      if (!thread.fan_pubkey) thread.fan_pubkey = pubkeyBase58;
    } else if (from === 'creator') {
      if (thread.creator_pubkey && thread.creator_pubkey !== pubkeyBase58) {
        return apiErr(req, res, 403, 'WALLET_MISMATCH', { role: 'creator' });
      }
      if (!thread.creator_pubkey) thread.creator_pubkey = pubkeyBase58;
    } else {
      return apiErr(req, res, 400, 'BAD_ROLE');
    }

    const prev = db.messages?.[threadId] ?? [];
    const creatorHasReplied = prev.some((m: any) => m.from === 'creator');
    if (from === 'fan' && !creatorHasReplied) {
      const fanMsgs = prev.filter((m: any) => m.from === 'fan').length;
      if (fanMsgs >= 2) {
        await track({
          event: 'message_sent',
          scope: 'public',
          handle: thread.creator,
          threadId,
          meta: { rejected: true, reason: 'pre_reply_cap' },
        });
        return apiErr(req, res, 429, 'PRE_REPLY_CAP', {
          message: "You can send at most 2 messages before the creator's first reply.",
        });
      }
    }

    const msgObj = {
      id: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      threadId,
      from,
      body: String(body),
      ts: Date.now(),
    };

    if (!db.messages) db.messages = {} as any;
    if (!db.messages[threadId]) db.messages[threadId] = [];
    db.messages[threadId].push(msgObj);

    await track({
      event: 'message_sent',
      scope: from === 'creator' ? 'creator' : 'public',
      handle: thread.creator,
      threadId,
    });

    if (from === 'creator' && msgObj.body.replace(/\s+/g, ' ').trim().length >= 30) {
      thread.status = 'answered';
      thread.answeredAt = Date.now();
      if (!db.escrows) db.escrows = {} as any;
      db.escrows[threadId] = {
        ...(db.escrows[threadId] || {}),
        status: 'released',
        releasedAt: Date.now(),
      };
      await track({
        event: 'creator_replied',
        scope: 'creator',
        handle: thread.creator,
        threadId,
        meta: { substantial: true },
      });
    }

    await writeDB(db);
    return apiOk(res, { message: msgObj });
  } catch (e: any) {
    return apiErr(req, res, 500, 'SERVER_ERROR', { detail: e?.message });
  }
}
