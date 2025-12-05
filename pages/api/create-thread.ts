// pages/api/create-thread.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../lib/db';
import * as Verify from '../../lib/verify';
import { apiErr, apiOk } from '../../lib/api';
import { track } from '../../lib/telemetry';
import { sendNewThreadEmail } from '../../lib/mail';

const DRIFT_MS = 5 * 60 * 1000; // ±5 Minuten

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
    try {
      const res = await fn(params);
      if (typeof res === 'boolean') return res;
    } catch {
      // versuche nächsten Kandidaten
    }
  }
  throw new Error('VERIFY_FN_NOT_FOUND');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return apiErr(req, res, 405, 'METHOD_NOT_ALLOWED');

  try {
    const {
      creator,           // handle
      fan,               // convenience display of fan (string)
      amount,            // number
      ttlHours,          // number
      firstMessage,      // string
      fanPubkey,         // string (wallet)
      creatorPubkey,     // string | null
      ref,               // referral code | null
      sigBase58, msg, pubkeyBase58, // signature triple
    } = req.body || {};

    // Pflichtfelder prüfen
    if (!creator || !fan || !amount || !ttlHours || !firstMessage || !sigBase58 || !msg || !pubkeyBase58) {
      return apiErr(req, res, 400, 'BAD_REQUEST');
    }

    // Prefix prüfen
    if (!String(msg).startsWith('ROR|create-thread|')) {
      return apiErr(req, res, 400, 'BAD_PREFIX');
    }

    // Zeitdrift prüfen
    const tsPart = String(msg).split('|').pop();
    const ts = Number(tsPart?.includes('ts=') ? tsPart.split('ts=').pop() : tsPart);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DRIFT_MS) {
      return apiErr(req, res, 400, 'TS_DRIFT');
    }

    // Signatur prüfen
    const ok = await verifySig({ msg, sigBase58, pubkeyBase58 });
    if (!ok) return apiErr(req, res, 401, 'BAD_SIGNATURE');

    // DB laden
    const db = await readDB();

    // Creator existiert & nicht gebannt
    const creatorEntry = (db.creators || {})[creator];
    if (creatorEntry && creatorEntry.banned) {
      return apiErr(req, res, 403, 'CREATOR_BANNED');
    }

    // Ref-Self-Check
    let safeRef = ref || null;
    if (safeRef && creatorEntry?.refCode === safeRef) {
      safeRef = null;
    }

    // IDs / Zeiten
    const id = `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = Date.now();
    const deadline = createdAt + Number(ttlHours) * 3600_000;

    // Sicherstellen, dass Strukturen existieren
    db.threads = db.threads || {};
    db.messages = db.messages || {};
    db.escrows = db.escrows || {};

    // Thread anlegen
    db.threads[id] = {
      id,
      creator,
      fan,
      amount: Number(amount) || 20,
      createdAt,
      deadline,
      status: 'open',
      fan_pubkey: fanPubkey || pubkeyBase58,
      creator_pubkey: creatorPubkey || null,
      paid_via: 'wallet',
      ref: safeRef,
    };

    // Erste Nachricht (Fan)
    db.messages[id] = [
      {
        id: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        threadId: id,
        from: 'fan',
        body: String(firstMessage),
        ts: Date.now(),
      },
    ];

    // Escrow-Stub (MVP, nicht on-chain)
    db.escrows[id] = {
      status: 'locked',
      until: deadline,
      source: 'wallet',
    };

    await writeDB(db);

    // Notify creator via email if verified
    if (creatorEntry?.email && creatorEntry?.emailVerified) {
      await sendNewThreadEmail({
        creator,
        email: creatorEntry.email,
        threadId: id,
        amount: Number(amount) || 20,
      });
    }

    // Telemetry
    await track({ event: 'chat_started', scope: 'public', handle: creator, threadId: id });

    return apiOk(res, { threadId: id });
  } catch (e: any) {
    return apiErr(req, res, 500, 'SERVER_ERROR', { detail: e?.message });
  }
}
