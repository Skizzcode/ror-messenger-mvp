// pages/api/refund-cron.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB, writeDB } from '../../lib/db';
import { refundEscrow } from '../../lib/escrow';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  const db = readDB();
  const now = Date.now();
  const refunded:string[] = [];

  for(const id of Object.keys(db.threads)){
    const th = db.threads[id];
    if(th.status==='open' && th.deadline < now){
      await refundEscrow({ threadId:id }); // v1: Stub -> später on-chain
      th.status='refunded';
      th.refundedAt = now;
      refunded.push(id);
    }
  }
  writeDB(db);
  res.json({refunded});
}
