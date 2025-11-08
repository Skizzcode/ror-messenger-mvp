// pages/creator/join.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { t } from '../../lib/telemetry';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let tmr: any;
  return (...args: Parameters<T>) => {
    clearTimeout(tmr);
    tmr = setTimeout(() => fn(...args), ms);
  };
}

export default function CreatorJoin() {
  const [mounted, setMounted] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('ref');
      if (r) setRefCode(r);
    }
    t('page_view', { scope: 'creator_join' });
  }, []);

  const cleanHandle = useMemo(
    () => handle.toLowerCase().replace(/[^a-z0-9-_]/g, ''),
    [handle]
  );

  // Live availability check (debounced)
  const checkAvailability = useMemo(
    () =>
      debounce(async (h: string) => {
        if (!h || h.length < 2) {
          setAvailable(null);
          setChecking(false);
          return;
        }
        try {
          const r = await fetch(`/api/creator-available?handle=${encodeURIComponent(h)}`);
          const j = await r.json();
          setAvailable(!!j.available);
          t('handle_check_result', { scope: 'creator_join', props: { handle: h, available: !!j.available } });
        } catch {
          setAvailable(null);
          t('handle_check_error', { scope: 'creator_join', props: { handle: h } });
        } finally {
          setChecking(false);
        }
      }, 300),
    []
  );

  useEffect(() => {
    setChecking(true);
    checkAvailability(cleanHandle);
  }, [cleanHandle, checkAvailability]);

  async function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1_000_000) {
      alert('Image too large. Please use < 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') {
        setAvatarDataUrl(result);
        t('join_avatar_selected', { scope: 'creator_join', props: { size: f.size } });
      }
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!cleanHandle || cleanHandle.length < 2) {
      alert('Pick a valid handle (letters/numbers, min 2).');
      return;
    }
    if (!available) {
      alert('Handle is not available.');
      return;
    }
    setSubmitting(true);
    try {
      t('join_submit_attempt', { scope: 'creator_join', props: { handle: cleanHandle, hasAvatar: !!avatarDataUrl } });
      const r = await fetch('/api/creator-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: cleanHandle,
          displayName,
          price,
          replyWindowHours,
          avatarDataUrl,
          ref: refCode || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        t('join_submit_error', { scope: 'creator_join', props: { handle: cleanHandle, err: j?.error || 'unknown' } });
        throw new Error(j?.error || 'Failed to create');
      }
      t('join_submit_success', { scope: 'creator_join', props: { handle: cleanHandle } });
      window.location.href = `/creator/${j.handle}`;
    } catch (e: any) {
      alert(e?.message || 'Error');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !!cleanHandle &&
    cleanHandle.length >= 2 &&
    available === true &&
    !submitting;

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-white/10 bg-background/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-ror-glass.svg" alt="RoR" className="h-9 w-9 rounded-2xl border border-white/10" />
            <div className="text-sm font-semibold">Reply or Refund</div>
          </Link>
          {mounted && (
            <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Become a creator</div>
              <div className="text-xs text-white/40">Set your inbox, avatar and pricing.</div>
            </div>
            {refCode && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">
                invited by {refCode}
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-white/60">Handle</label>
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  placeholder="your-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
                <span
                  className={
                    'text-[11px] px-2 py-1 rounded-full border ' +
                    (checking
                      ? 'border-white/15 text-white/40'
                      : available === true
                      ? 'bg-emerald-400/10 text-emerald-100 border-emerald-400/30'
                      : available === false
                      ? 'bg-red-400/10 text-red-50 border-red-400/30'
                      : 'border-white/15 text-white/40')
                  }
                >
                  {checking ? 'Checking…' : available === true ? 'Available' : available === false ? 'Taken' : '—'}
                </span>
              </div>
              <div className="text-[11px] text-white/35">Public URL: /c/{cleanHandle || 'your-handle'}</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/60">Display name</label>
              <input
                className="input"
                placeholder="Your public name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/60">Price (EUR)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/60">Reply window (hours)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={replyWindowHours}
                onChange={(e) => setReplyWindowHours(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/60">Avatar (upload)</label>
              <input
                type="file"
                accept="image/*"
                onChange={onAvatarFileSelected}
                className="text-xs text-white/50"
              />
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt="avatar"
                  className="h-16 w-16 rounded-2xl border border-white/10 object-cover"
                />
              ) : (
                <div className="text-[11px] text-white/35">No avatar selected.</div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={submit} disabled={!canSubmit} className="btn">
              {submitting ? 'Creating…' : 'Create my creator inbox'}
            </button>
            <Link href="/" className="text-sm px-4 py-2 rounded-full border border-white/15 hover:bg-white/5">
              Cancel
            </Link>
          </div>

          <p className="text-[11px] text-white/35">
            Fans can pay by wallet or card. If you don’t reply in time, fans get an automatic refund.
          </p>
        </div>
      </main>
    </div>
  );
}
