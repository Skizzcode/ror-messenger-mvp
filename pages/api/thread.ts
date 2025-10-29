
import type { NextApiRequest, NextApiResponse } from 'next';
import { readDB } from '../../lib/db';

export default function handler(req:NextApiRequest, res:NextApiResponse){
  const { id } = req.query;
  const db = readDB();
  const thread = db.threads[id as string];
  const messages = db.messages[id as string] || [];
  res.json({ thread, messages });
}
