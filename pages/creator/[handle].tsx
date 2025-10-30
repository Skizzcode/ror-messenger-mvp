// pages/creator/[handle].tsx
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function CreatorDashboard({ handle }: { handle: string }) {
  // load data
  const { data: threads } = useSWR(`/api/creator-threads?handle=${handle}`, fetcher, { refreshInterval: 3000 });
  const { data: settings, mutate: mutateSettings } = useSWR(`/api/creator-settings?handle=${handle}`, fetcher);
  const { data: stats } = useSWR(`/api/creator-stats?handle=${handle}`, fetcher, { refreshInterval: 5000 });

  // local state
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [displayName, setDisplayName] = useState<string>('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>('');
  const [savingAvatar, setSavingAvatar] = useState(false);

  const walletAdapter = useWallet();

  useEffect(() => {
    if (settings) {
      setPrice(settings.price ?? 20);
      setReplyWindowHours(settings.replyWindowHours ?? 48);
      setDisplayName(settings.displayName ?? '');
      setAvatarDataUrl(settings.avatarDataUrl ?? '');
    }
  }, [settings]);

  // totals
  const totals = useMemo(() => {
    const g = threads?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  }, [threads]);

  // referral link (creator → creator)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const refLink = settings?.refCode ? `${baseUrl}/creator/join?ref=${settings.refCode}` : '';

  async function saveSettings(extra?: Record<string, any>) {
    const body = {
      handle,
      price,
      replyWindowHours,
      displayName,
      ...(extra || {}),
    };
    const r = await fetch('/api/creator-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      mutateSettings();
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j?.error || 'Failed to save');
    }
  }

  async function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      alert('Image too large. Please use < 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') {
        setAvatarDataUrl(result);
        setSavingAvatar(true);
        try {
          const r = await fetch('/api/creator-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              handle,
              price,
              replyWindowHours,
              displayName,
              avatarDataUrl: result,
            }),
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

  function formatAmount(a: number | undefined) {
    const n = typeof a === 'number' ? a : 0;
    return `€${n.toFixed(2)}`;
  }

  return (
    <div className="min-h-screen bg-background text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-background/60 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={avatarDataUrl || '/logo-ror-glass.svg'}
              className="h-10 w-10 rounded-2xl border border-white/10 object-cover"
              alt="Creator avatar"
            />
            <div>
              <div className="font-black text-lg">
                {displayName ? displayName : `@${handle}`}
              </div>
              <div className="text-xs text-white/35">Creator dashboard</div>
            </div>
          </div>
          <div className="text-sm text-white/40">@{handle}</div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* LEFT */}
        <section className="md:col-span-2 space-y-6">
          {/* STATS */}
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

          {/* THREADS */}
          <Tabs
            tabs={[
              { key: 'open', label: 'Open', items: threads?.grouped?.open || [] },
              { key: 'answered', label: 'Answered', items: threads?.grouped?.answered || [] },
              { key: 'refunded', label: 'Refunded', items: threads?.grouped?.refunded || [] },
            ]}
            renderItem={(t: any) => (
              <div
                key={t.id}
                className="p-3 rounded-xl border border-white/10 flex items-center justify-between bg-white/5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{t.id.slice(0, 8)}…</div>
                    {/* amount badge */}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                      {formatAmount(t.amount)}
                    </span>
                    {/* status badge */}
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
                <Link href={`/c/${t.id}`} className="btn">
                  Open chat
                </Link>
              </div>
            )}
          />
        </section>

        {/* RIGHT */}
        <aside className="space-y-6">
          {/* Profile & settings */}
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
            {savingAvatar && (
              <div className="text-[11px] text-white/40">Uploading…</div>
            )}
            {avatarDataUrl ? (
              <img
                src={avatarDataUrl}
                alt="avatar"
                className="h-12 w-12 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="text-[11px] text-white/30">
                No avatar yet. Upload a small image.
              </div>
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
                const pk = walletAdapter.publicKey?.toBase58();
                if (!pk) {
                  alert('Connect a wallet in your browser first.');
                  return;
                }
                saveSettings({ wallet: pk });
              }}
            >
              Use connected wallet
            </button>
          </div>

          {/* referral */}
          <div className="card p-4 space-y-3">
            <div className="font-semibold">Invite another creator</div>
            <p className="text-sm text-white/45">
              Share this link. Other creators will start onboarding with your referral code.
            </p>
            <div className="input break-all">{refLink || 'Loading…'}</div>
            <button
              className="btn w-full"
              onClick={() => {
                if (refLink) navigator.clipboard.writeText(refLink);
              }}
            >
              Copy link
            </button>
          </div>
        </aside>
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
  tabs,
  renderItem,
}: {
  tabs: { key: string; label: string; items: any[] }[];
  renderItem: (x: any) => ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.key || 'open');
  const items = tabs.find((t) => t.key === active)?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              'px-3 py-1 rounded-full text-sm border ' +
              (active === t.key ? 'bg-white text-black border-transparent' : 'border-white/20')
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.length ? (
          items.map(renderItem)
        ) : (
          <div className="text-white/40 text-sm">Nothing here.</div>
        )}
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.handle } };
}
