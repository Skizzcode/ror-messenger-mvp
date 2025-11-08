// pages/fan/index.tsx
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useEffect, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { t } from '../../lib/telemetry';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function FanDashboard() {
  const wallet = useWallet();
  const pubkey = wallet.publicKey?.toBase58() || '';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    t('page_view', { scope: 'fan_inbox' });
  }, []);

  useEffect(() => {
    t('fan_wallet_state', { scope: 'fan_inbox', props: { connected: !!pubkey } });
  }, [pubkey]);

  const { data } = useSWR(
    () => (pubkey ? `/api/fan-threads?wallet=${encodeURIComponent(pubkey)}` : null),
    fetcher,
    { refreshInterval: 3000 }
  );

  const totals = useMemo(() => {
    const g = data?.grouped;
    return {
      open: g?.open?.length || 0,
      answered: g?.answered?.length || 0,
      refunded: g?.refunded?.length || 0,
      all: g?.all?.length || 0,
    };
  }, [data]);

  function formatRemaining(ms: number) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  return (
    <div className="min-h-screen bg-background text-white">
      {/* GLOBAL HEADER */}
      <header className="sticky top-0 z-30 bg-background/70 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-10 w-10 rounded-2xl border border-white/10"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Reply or Refund</div>
              <div className="text-[10px] text-white/40">Paid DMs for creators</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-white/40 break-all max-w-[40vw]">
              {pubkey ? pubkey : 'Not connected'}
            </div>
            {mounted && (
              <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        {/* LEFT: Overview */}
        <section className="md:col-span-2 space-y-6">
          {!pubkey && (
            <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-sm">
              Connect your wallet to view your chats.
            </div>
          )}

          {pubkey && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Open" value={totals.open} />
                <Stat label="Answered" value={totals.answered} />
                <Stat label="Refunded" value={totals.refunded} />
                <Stat label="All" value={totals.all} />
              </div>

              <Tabs
                tabs={[
                  { key: 'open', label: 'Open', items: data?.grouped?.open || [] },
                  { key: 'answered', label: 'Answered', items: data?.grouped?.answered || [] },
                  { key: 'refunded', label: 'Refunded', items: data?.grouped?.refunded || [] },
                ]}
                onSwitch={(key) => t('fan_tab_switch', { scope: 'fan_inbox', props: { tab: key } })}
                renderItem={(tItem: any) => (
                  <div
                    key={tItem.id}
                    className="p-3 rounded-xl border border-white/10 flex items-center justify-between bg-white/5"
                  >
                    <div>
                      <div className="font-semibold">{tItem.id.slice(0, 8)}…</div>
                      <div className="text-xs text-white/40">
                        {tItem.status.toUpperCase()}
                        {typeof tItem.messagesCount === 'number' ? ` · ${tItem.messagesCount} msgs` : null}
                        {tItem.status === 'open' && typeof tItem.remainingMs === 'number' && (
                          <> · time left: {formatRemaining(tItem.remainingMs)}</>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/c/${tItem.id}`}
                      className="btn"
                      onClick={() => {
                        t('chat_view', { scope: 'fan', threadId: tItem.id, handle: tItem.creator });
                        t('fan_open_chat_click', { scope: 'fan_inbox', props: { threadId: tItem.id } });
                      }}
                    >
                      Open chat
                    </Link>
                  </div>
                )}
              />
            </>
          )}
        </section>

        {/* RIGHT: Tips */}
        <aside className="space-y-6">
          <div className="card p-4 space-y-2">
            <div className="font-semibold">Tips</div>
            <ul className="text-sm text-white/60 list-disc pl-5 space-y-1">
              <li>Open chats show the remaining reply window.</li>
              <li>Answered chats auto-release escrow after a substantial reply.</li>
              <li>Refunded chats returned after timeout if no reply.</li>
            </ul>
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
  tabs, renderItem, onSwitch,
}: {
  tabs: { key: string; label: string; items: any[] }[];
  renderItem: (x: any) => ReactNode;
  onSwitch: (key: string) => void;
}) {
  const [active, setActive] = useState(tabs[0]?.key || 'open');
  const items = tabs.find((t) => t.key === active)?.items || [];
  useEffect(() => { onSwitch(active); }, [active, onSwitch]);

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
        {items.length ? items.map(renderItem) : <div className="text-white/40 text-sm">Nothing here.</div>}
      </div>
    </div>
  );
}
