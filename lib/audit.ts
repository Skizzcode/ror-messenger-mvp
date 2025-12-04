// lib/audit.ts
import { readDB, writeDB } from './db';

export type AuditEvent = {
  ts: number;
  kind: string;
  actor: string; // wallet or system
  detail?: Record<string, any>;
};

const MAX_AUDIT = 500;

export async function logAudit(event: AuditEvent) {
  const db = await readDB();
  const ev: AuditEvent = {
    ts: event.ts || Date.now(),
    kind: event.kind,
    actor: event.actor || 'unknown',
    detail: event.detail || {},
  };
  const anyDb = db as any;
  if (!Array.isArray(anyDb.audit)) anyDb.audit = [];
  anyDb.audit.push(ev);
  if (anyDb.audit.length > MAX_AUDIT) {
    anyDb.audit = anyDb.audit.slice(anyDb.audit.length - MAX_AUDIT);
  }
  await writeDB(db);
}

export async function getAudit(limit = 50): Promise<AuditEvent[]> {
  const db = await readDB();
  const anyDb = db as any;
  const arr: AuditEvent[] = Array.isArray(anyDb.audit) ? anyDb.audit : [];
  const lim = Math.max(1, Math.min(limit, MAX_AUDIT));
  return arr.slice(Math.max(0, arr.length - lim));
}
