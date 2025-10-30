// pages/creator/[handle].tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CreatorDashboard({ handle }: { handle: string }) {
  // API-Daten
  const { data: threads } = useSWR(`/api/creator-threads?handle=${handle}`, fetcher, {
    refreshInterval: 3000,
  });
  const { data: settings, mutate: mutateSettings } = useSWR(
    `/api/creator-settings?handle=${handle}`,
    fetcher
  );
  const { data: stats } = useSWR(`/api/creator-stats?handle=${handle}`, fetcher, {
    refreshInterval: 5000,
  });

  // Form-States
  const [displayName, setDisplayName] = useState(handle);
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [walletStr, setWalletStr] = useState<string>('');
  const [refCode, setRefCode] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const walletAdapter = useWallet();

  // API → State
  useEffect(() => {
    if (settings) {
      setDisplayName(settings.displayName ?? handle);
      setPrice(settings.price ?? 20);
      setReplyWindowHours(settings.replyWindowHours ?? 48);
      setWalletStr(settings.wallet ?? '');
      setRefCode(settings.refCode ?? '');
      setAvatarUrl(settings.avatarUrl ?? '');
    }
  }, [settings, handle]);

  // Threads zählen
  const totals = useMemo(() => {
    const g = threads?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  }, [threads]);

  // Ref-Link bauen
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const refLink =
    refCode && baseUrl ? `${baseUrl}/c/${handle}?ref=${encodeURIComponent(refCode)}` : '';

  async function saveSettings() {
    const r = await fetch(`/api/creator-settings?handle=${handle}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle,
        displayName,
        price,
        replyWindowHours,
        wallet: walletStr,
        refCode,
        avatarUrl,
      }),
    });
    if (r.ok) {
      mutateSettings();
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j?.error || 'Failed to save');
    }
  }

  function formatRemaining(ms: number) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-8 w-8 rounded-2xl border border-white/10 shadow-sm"
            />
            <div>
              <div className="text-sm text-white/40">Reply or Refund</div>
              <div className="text-2xl font-semibold tracking-tight">
                {displayName || handle}
              </div>
              <div className="text-[10px] text-white/25">@{handle}</div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Link
              href={`/c/${handle}`}
              className="bg-white/10 hover:bg-white/20 transition px-3 py-1.5 rounded-xl text-xs"
            >
              Open chat
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* LEFT: stats + threads */}
        <section className="md:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <Stat
              label="Earnings (MTD)"
              value={stats ? `€${(stats.revenue?.mtd ?? 0).toFixed(2)}` : '—'}
              wide
            />
            <Stat label="Open" value={totals.open} />
            <Stat label="Answered" value={totals.answered} />
            <Stat label="Refunded" value={totals.refunded} />
          </div>

          {/* Threads */}
          <Tabs
            tabs={[
              { key: 'open', label: 'Open', items: threads?.grouped?.open || [] },
              { key: 'answered', label: 'Answered', items: threads?.grouped?.answered || [] },
              { key: 'refunded', label: 'Refunded', items: threads?.grouped?.refunded || [] },
            ]}
            renderItem={(t: any) => (
              <div
                key={t.id}
                className="p-3 rounded-2xl bg-white/[0.01] border border-white/[0.04] flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-sm">Thread {t.id.slice(0, 8)}…</div>
                  <div className="text-xs text-white/40">
                    {t.status.toUpperCase()} · {t.messagesCount} msgs
                    {t.status === 'open' && <> · ⏳ {formatRemaining(t.remainingMs)} left</>}
                    {t.ref && (
                      <>
                        {' '}
                        · <span className="text-[10px] text-white/30">ref: {t.ref}</span>
                      </>
                    )}
                  </div>
                </div>
                <Link
                  href={`/c/${t.id}`}
                  className="bg-white text-black text-xs px-3 py-1.5 rounded-xl"
                >
                  Open chat
                </Link>
              </div>
            )}
          />
        </section>

        {/* RIGHT: settings */}
        <aside className="space-y-6">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] p-4 space-y-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="h-10 w-10 rounded-2xl object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center text-xs">
                  {(displayName || handle).slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-sm font-medium">Settings</div>
                <div className="text-xs text-white/40">Public profile, wallet, price</div>
              </div>
            </div>

            <label className="text-xs text-white/40">Display name</label>
            <input
              className="bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Kenny • Solana"
            />

            <label className="text-xs text-white/40">Price (EUR/USDC)</label>
            <input
              type="number"
              className="bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-sm"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />

            <label className="text-xs text-white/40">Reply window (hours)</label>
            <input
              type="number"
              className="bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-sm"
              value={replyWindowHours}
              onChange={(e) => setReplyWindowHours(Number(e.target.value))}
            />

            <label className="text-xs text-white/40">Payout wallet (Solana)</label>
            <input
              className="bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-sm"
              value={walletStr}
              onChange={(e) => setWalletStr(e.target.value)}
              placeholder="Your public key"
            />

            <label className="text-xs text-white/40">Avatar URL</label>
            <input
              className="bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-sm"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />

            <label className="text-xs text-white/40">Ref code</label>
            <input
              className="bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-sm"
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
              placeholder="TIKTOK-JAN"
            />

            <button
              onClick={saveSettings}
              className="w-full bg-white text-black py-2 rounded-xl text-sm"
            >
              Save settings
            </button>

            {refLink && (
              <div className="text-[10px] text-white/30 break-all">Your invite: {refLink}</div>
            )}

            <button
              onClick={() => {
                const pk = walletAdapter.publicKey?.toBase58();
                if (!pk) {
                  alert('Connect wallet first');
                  return;
                }
                setWalletStr(pk);
              }}
              className="w-full bg-white/5 py-1.5 rounded-xl text-xs text-white/70"
            >
              Use connected wallet
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

// small helpers ---------------------------------------------------

function Stat({ label, value, wide }: { label: string; value: any; wide?: boolean }) {
  return (
    <div
      className={
        'rounded-2xl bg-white/[0.02] border border-white/[0.03] p-4 backdrop-blur-sm ' +
        (wide ? 'col-span-2' : '')
      }
    >
      <div className="text-xs text-white/35">{label}</div>
      <div className="text-2xl font-semibold mt-1 tracking-tight">{value}</div>
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
              'px-3 py-1.5 rounded-full text-sm border ' +
              (active === t.key ? 'bg-white text-black border-transparent' : 'border-white/10')
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
          <div className="text-xs text-white/25">Nothing here.</div>
        )}
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.handle } };
}
