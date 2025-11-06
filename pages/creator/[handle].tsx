// pages/creator/[handle].tsx
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

/** Build short-lived auth headers from the connected wallet (signMessage) */
async function buildAuthHeaders(wallet: any) {
  if (!wallet?.publicKey || !wallet?.signMessage) return null;
  const pub = wallet.publicKey.toBase58();
  const msg = `ROR|auth|wallet=${pub}|ts=${Date.now()}`;
  const enc = new TextEncoder().encode(msg);
  const sig = await wallet.signMessage(enc);
  const { default: bs58 } = await import('bs58');
  return {
    'x-wallet': pub,
    'x-msg': msg,
    'x-sig': bs58.encode(sig),
  };
}

type ThreadsResp = {
  handle: string;
  total: number;
  grouped: {
    open: any[];
    answered: any[];
    refunded: any[];
    all: any[];
  };
};

type SettingsResp = {
  handle: string;
  displayName?: string;
  avatarDataUrl?: string | null;
  price?: number;
  refCode?: string;
  replyWindowHours?: number;
};

type StatsResp = {
  handle: string;
  revenue: { mtd: number; allTime: number };
};

export default function CreatorDashboard({ handle }: { handle: string }) {
  const wallet = useWallet();

  // Auth headers (refresh every 60s)
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let timer: any;
    async function cycle() {
      try {
        if (!wallet.publicKey) {
          setAuthHeaders(null);
        } else {
          const h = await buildAuthHeaders(wallet as any);
          setAuthHeaders(h);
        }
      } catch (e) {
        console.error('auth sign failed', e);
        setAuthHeaders(null);
      } finally {
        setAuthReady(true);
      }
      timer = setTimeout(cycle, 60_000);
    }
    cycle();
    return () => { if (timer) clearTimeout(timer); };
  }, [wallet.publicKey]);

  // Fetchers
  const authedFetcher = useMemo(() => {
    return async (url: string) => {
      if (!authHeaders) throw new Error('Unauthorized');
      const r = await fetch(url, { headers: authHeaders });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      return j;
    };
  }, [authHeaders]);

  const publicFetcher = (url: string) => fetch(url).then(r => r.json());

  // Data
  const { data: threads, error: threadsErr } = useSWR<ThreadsResp>(
    () => (authHeaders ? `/api/creator-threads?handle=${handle}` : null),
    authedFetcher,
    { refreshInterval: 3000, revalidateOnFocus: false }
  );

  const { data: settings, mutate: mutateSettings } = useSWR<SettingsResp>(
    `/api/creator-settings?handle=${handle}`, // public: Name/Avatar/Price
    publicFetcher
  );

  const { data: stats, error: statsErr } = useSWR<StatsResp>(
    () => (authHeaders ? `/api/creator-stats?handle=${handle}` : null),
    authedFetcher,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  // Local state mirrored from settings
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [displayName, setDisplayName] = useState<string>('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>('');
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    if (settings) {
      setPrice(settings.price ?? 20);
      setReplyWindowHours(settings.replyWindowHours ?? 48);
      setDisplayName(settings.displayName ?? '');
      setAvatarDataUrl(settings.avatarDataUrl || '');
    }
  }, [settings]);

  // Totals
  const totals = useMemo(() => {
    const g = threads?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  }, [threads]);

  // Referral link (creator → creator)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const refLink = settings?.refCode ? `${baseUrl}/creator/join?ref=${settings.refCode}` : '';

  // Handlers
  async function saveSettings(extra?: Record<string, any>) {
    if (!authHeaders) { alert('Connect your creator wallet first.'); return; }
    const body = { handle, price, replyWindowHours, displayName, ...(extra || {}) };
    const r = await fetch('/api/creator-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeaders as any) },
      body: JSON.stringify(body),
    });
    if (r.ok) mutateSettings();
    else {
      const j = await r.json().catch(() => ({}));
      alert(j?.error || 'Failed to save');
    }
  }

  async function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { alert('Image too large. Use < 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') {
        setAvatarDataUrl(result);
        setSavingAvatar(true);
        try {
          if (!authHeaders) { alert('Connect your creator wallet first.'); return; }
          const r = await fetch('/api/creator-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authHeaders as any) },
            body: JSON.stringify({ handle, price, replyWindowHours, displayName, avatarDataUrl: result }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            alert(j?.error || 'Failed to upload avatar');
          } else {
            mutateSettings();
          }
        } finally {
          setSavingAvatar(false);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  function formatRemaining(ms: number) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }
  function formatAmount(a?: number) {
    const n = typeof a === 'number' ? a : 0;
    return `€${n.toFixed(2)}`;
  }

  // Guards (Apple++): no raw HTTP – just pretty states
  const notConnected = mounted && !wallet.publicKey;
  const forbidden =
    (threadsErr?.message || statsErr?.message || '').toLowerCase().includes('forbidden');
  const unauthorized =
    (threadsErr?.message || statsErr?.message || '').toLowerCase().includes('unauthorized');

  const guardBg =
    'bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 rounded-3xl backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]';

  return (
    <div className="min-h-screen bg-background text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-background/70 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={avatarDataUrl || '/logo-ror-glass.svg'}
              className="h-9 w-9 rounded-2xl border border-white/10 object-cover"
              alt="Creator avatar"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold">
                {displayName || `@${handle}`}
              </div>
              <div className="text-[10px] text-white/40">Creator dashboard</div>
            </div>
          </Link>
          {mounted && (
            <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* GUARD: Not connected */}
        {notConnected && (
          <div className={`p-8 text-center ${guardBg}`}>
            <div className="flex justify-center mb-4">
              <img src="/logo-ror-glass.svg" className="h-12 w-12 rounded-2xl border border-white/10" alt="RoR" />
            </div>
            <h1 className="text-xl font-semibold">Connect your wallet</h1>
            <p className="text-sm text-white/55 mt-1">
              This dashboard is private. Connect the wallet that owns <b>@{handle}</b>.
            </p>
            <div className="flex gap-2 justify-center mt-5">
              <WalletMultiButton className="!bg-white !text-black !rounded-xl !px-4 !py-2 !text-sm" />
              <Link href="/" className="px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5">
                Go home
              </Link>
            </div>
          </div>
        )}

        {/* GUARD: Wrong wallet / Unauthorized */}
        {!notConnected && authReady && (forbidden || unauthorized) && (
          <div className={`p-8 text-center ${guardBg}`}>
            <div className="flex justify-center mb-4">
              <img src="/logo-ror-glass.svg" className="h-12 w-12 rounded-2xl border border-white/10" alt="RoR" />
            </div>
            <h1 className="text-xl font-semibold">Wrong wallet</h1>
            <p className="text-sm text-white/55 mt-1">
              <b>@{handle}</b> is bound to a different wallet. Please switch to the correct one.
            </p>
            <div className="text-[11px] text-white/35 mt-2">Tip: Refresh after switching.</div>
            <div className="flex gap-2 justify-center mt-5">
              <WalletMultiButton className="!bg-white !text-black !rounded-xl !px-4 !py-2 !text-sm" />
              <Link href="/" className="px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5">
                Go home
              </Link>
            </div>
          </div>
        )}

        {/* CONTENT */}
        {wallet.publicKey && authHeaders && !forbidden && !unauthorized && (
          <div className="grid gap-6 md:grid-cols-3">
            {/* LEFT: Overview + Threads */}
            <section className="md:col-span-2 space-y-6">
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-white/10 col-span-4 md:col-span-2 bg-white/5">
                  <div className="text-xs text-white/40">Earnings (MTD)</div>
                  <div className="text-2xl font-bold">
                    €{(stats?.revenue?.mtd ?? 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-white/40 mt-1">
                    All-time: €{(stats?.revenue?.allTime ?? 0).toFixed(2)}
                  </div>
                </div>
                <Stat label="Open" value={totals.open} />
                <Stat label="Answered" value={totals.answered} />
                <Stat label="Refunded" value={totals.refunded} />
                <Stat label="All" value={totals.all} />
              </div>

              <Tabs
                tabs={[
                  { key: 'open', label: 'Open', items: threads?.grouped?.open || [] },
                  { key: 'answered', label: 'Answered', items: threads?.grouped?.answered || [] },
                  { key: 'refunded', label: 'Refunded', items: threads?.grouped?.refunded || [] },
                ]}
                renderItem={(t: any) => (
                  <div key={t.id} className="p-3 rounded-xl border border-white/10 flex items-center justify-between bg-white/5">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{t.id.slice(0, 8)}…</div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                          {formatAmount(t.amount)}
                        </span>
                        <span
                          className={
                            'text-[10px] px-2 py-0.5 rounded-full ' +
                            (t.status === 'open'
                              ? 'bg-emerald-400/10 text-emerald-50 border border-emerald-400/40'
                              : t.status === 'answered'
                              ? 'bg-white/10 text-white/80 border border-white/15'
                              : 'bg-red-400/10 text-red-50 border border-red-400/25')
                          }
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-white/40">
                        {t.messagesCount} msgs
                        {t.status === 'open' && <> · ⏳ {formatRemaining(t.remainingMs)} left</>}
                        {t.fanPubkey ? <> · fan: {t.fanPubkey.slice(0, 6)}…</> : null}
                      </div>
                    </div>
                    <Link href={`/c/${t.id}`} className="btn">Open chat</Link>
                  </div>
                )}
              />
            </section>

            {/* RIGHT: Profile / Settings / Share */}
            <aside className="space-y-6">
              <div className="card p-4 space-y-3">
                <div className="font-semibold">Profile</div>

                <label className="text-sm text-white/50">Display name</label>
                <input
                  className="input"
                  placeholder="Your public name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />

                <label className="text-sm text-white/50">Avatar (upload)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onAvatarFileSelected}
                  className="text-xs text-white/50"
                />
                {savingAvatar && <div className="text-[11px] text-white/40">Uploading…</div>}
                {avatarDataUrl ? (
                  <img
                    src={avatarDataUrl}
                    alt="avatar"
                    className="h-12 w-12 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <div className="text-[11px] text-white/30">No avatar yet. Upload a small image.</div>
                )}

                <div className="h-px bg-white/10" />

                <div className="font-semibold">Chat settings</div>
                <label className="text-sm text-white/50">Price (EUR / USDC equiv.)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />

                <label className="text-sm text-white/50">Reply window (hours)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={replyWindowHours}
                  onChange={(e) => setReplyWindowHours(Number(e.target.value))}
                />

                <button className="btn w-full" onClick={() => saveSettings()}>
                  Save
                </button>

                <button
                  className="btn w-full"
                  onClick={() => {
                    const pk = wallet.publicKey?.toBase58();
                    if (!pk) { alert('Connect a wallet in your browser first.'); return; }
                    saveSettings({ wallet: pk });
                  }}
                >
                  Use connected wallet
                </button>
              </div>

              <div className="card p-4 space-y-3">
                <div className="font-semibold">Public chat link</div>
                <p className="text-sm text-white/45">Share this link so fans can pay to DM you.</p>
                <div className="input break-all">
                  {`${typeof window !== 'undefined' ? window.location.origin : ''}/c/${handle}`}
                </div>
                <button
                  className="btn w-full"
                  onClick={() => {
                    const url = `${window.location.origin}/c/${handle}`;
                    navigator.clipboard.writeText(url);
                  }}
                >
                  Copy link
                </button>
              </div>

              <div className="card p-4 space-y-3">
                <div className="font-semibold">Invite another creator</div>
                <p className="text-sm text-white/45">
                  Your referral link lets other creators onboard with your code.
                </p>
                <div className="input break-all">{refLink || 'Loading…'}</div>
                <button
                  className="btn w-full"
                  onClick={() => { if (refLink) navigator.clipboard.writeText(refLink); }}
                >
                  Copy invite link
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 text-center bg-white/5">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/40">{label}</div>
    </div>
  );
}

function Tabs({
  tabs, renderItem
}: { tabs: { key: string; label: string; items: any[] }[]; renderItem: (x: any) => ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.key || 'open');
  const items = tabs.find(t => t.key === active)?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={'px-3 py-1 rounded-full text-sm border ' + (active === t.key ? 'bg-white text-black border-transparent' : 'border-white/20')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.length ? items.map(renderItem) : <div className="text-white/40 text-sm">Nothing here.</div>}
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.handle } };
}
