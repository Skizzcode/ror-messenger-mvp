// lib/telemetry.ts
/**
 * Mini telemetry helper — sendet "fire-and-forget" Events an /api/telemetry
 * Beispiel: t('page_view', { scope: 'home' })
 */
export async function t(
  event: string,
  options?: { scope?: string; props?: Record<string, any> }
) {
  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event,
        scope: options?.scope || 'global',
        props: options?.props || {},
      }),
    });
  } catch {
    // leise ignorieren
  }
}
