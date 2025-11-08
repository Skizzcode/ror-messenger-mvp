// lib/telemetry.ts
import { readDB, writeDB } from './db';

/**
 * Offene Typen, damit bestehende und künftige Events/Scopes/Extra-Felder
 * keine TS-Fehler erzeugen (z. B. props, campaign, etc.).
 */
export type TelemetryEvent = string;   // z.B. 'page_view', 'escrow_init', ...
export type TelemetryScope = string;   // z.B. 'public', 'creator', 'fan', 'chat', ...

export type Payload = {
  event: TelemetryEvent;
  ts?: number;
  scope?: TelemetryScope;
  handle?: string | null;
  threadId?: string | null;
  meta?: Record<string, any>;
  /** zusätzliche Felder (z. B. props) sind erlaubt */
  [key: string]: any;
};

/**
 * -------- Serverseitig (persistente Telemetry) ----------
 * Wir fassen den globalen DB-Typ NICHT an.
 * Wir hängen `events` lokal via any-Cast an und schreiben db unverändert zurück.
 */
export async function track(payload: Payload) {
  const db = await readDB(); // typisiert als DB
  const anyDb = db as any;   // lokale Erweiterung, ohne globale Typen zu verändern

  if (!anyDb.events) anyDb.events = [];

  // Alles mitschreiben (inkl. zusätzlicher Keys wie props), ts sicherstellen
  const row = { ...payload, ts: payload.ts ?? Date.now() };

  // Lean halten: keine riesigen Objekte in meta unbesehen pushen – hier vertrauen wir dem Aufrufer
  anyDb.events.push(row);

  // Speicher begrenzen (max 5000)
  if (anyDb.events.length > 5000) {
    anyDb.events = anyDb.events.slice(anyDb.events.length - 5000);
  }

  await writeDB(db); // bleibt ein gültiges DB-Objekt
}

/** kleine Helper für GET-Dumps (QA /api/telemetry?limit=20) */
export async function getRecentEvents(limit = 50) {
  const db = await readDB();
  const anyDb = db as any;
  const all: any[] = Array.isArray(anyDb.events) ? anyDb.events : [];
  const lim = Number.isFinite(limit) ? Math.max(1, Math.min(1000, limit)) : 50;
  return all.slice(Math.max(0, all.length - lim));
}

/**
 * -------- Clientseitig (Beacon) ----------
 * `t(event, extra?)` wird von Pages importiert.
 * No-Op, wenn kein Browser oder NEXT_PUBLIC_TELEMETRY_URL fehlt.
 */
const TELEMETRY_URL: string | undefined =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_TELEMETRY_URL || '/api/telemetry')
    : undefined;

/**
 * Lightweight Telemetry-Beacon für den Client
 * @param event string (beliebiger Event-Name)
 * @param extra optionale Felder (scope, handle, threadId, meta, ts, props, ...)
 */
export function t(
  event: TelemetryEvent,
  extra?: Omit<Payload, 'event'>
): void {
  if (!TELEMETRY_URL) return; // no-op wenn nicht konfiguriert oder SSR
  try {
    const body = JSON.stringify({ event, ...(extra || {}) });
    fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body,
    }).catch(() => {});
  } catch {
    // bewusst geschluckt – Telemetry darf nie UX bremsen
  }
}
