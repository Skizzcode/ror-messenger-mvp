// pages/creator/join.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function CreatorJoinPage() {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ref aus URL holen
  useEffect(() => {
    if (router.isReady) {
      const r = router.query.ref;
      if (typeof r === 'string') setRef(r);
    }
  }, [router.isReady, router.query]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) {
      setError('Please choose a handle.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const r = await fetch('/api/creator-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: handle.trim(),
          displayName: displayName.trim(),
          // das WICHTIGE:
          referredBy: ref || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error || 'Could not create creator.');
      } else {
        // weiter in eigenes Dashboard
        router.push(`/creator/${handle.trim()}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-6 space-y-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            src="/logo-ror-glass.svg"
            alt="RoR"
            className="h-10 w-10 rounded-2xl border border-white/10"
          />
          <div>
            <div className="text-lg font-bold tracking-tight">Become a Creator</div>
            {ref ? (
              <div className="text-xs text-white/40">
                invited by <span className="font-mono">{ref}</span>
              </div>
            ) : (
              <div className="text-xs text-white/40">set up your paid inbox</div>
            )}
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="text-sm text-white/60 block mb-1">Creator handle</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="e.g. kenny, creator-alex"
              className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <p className="text-[11px] text-white/30 mt-1">
              This will be your URL: /creator/{handle || 'your-handle'}
            </p>
          </div>

          <div>
            <label className="text-sm text-white/60 block mb-1">Display name (optional)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your public name"
              className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          {error && <div className="text-xs text-red-300">{error}</div>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-white text-black rounded-xl py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create my creator inbox'}
          </button>
        </form>

        <p className="text-[11px] text-white/35 text-center">
          You can connect your wallet & upload your avatar in the dashboard.
        </p>
      </div>
    </div>
  );
}
