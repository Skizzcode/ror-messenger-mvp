// pages/creator/[handle].tsx
import useSWR from 'swr';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { t } from '../../lib/telemetry';

// Wallet-Button (client-only)
const WalletMultiButtonDynamic = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
);

const fetchJSON = (url: string, init?: RequestInit) =>
  fetch(url, init).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/** Einmalige Kurzzeit-Signatur zum Starten der 60-Minuten-Session */
async function signAuthHeaders(wallet: any) {
  if (!wallet?.publicKey || !wallet?.signMessage) return null;
  const pub = wallet.publicKey.toBase58();
  const msg = `ROR|auth|wallet=${pub}|ts=${Date.now()}`;
  const enc = new TextEncoder().encode(msg);
  const sig = await wallet.signMessage(enc);
  const { default: bs58 } = await import('bs58');
  return { 'x-wallet': pub, 'x-msg': msg, 'x-sig': bs58.encode(sig) };
}

export default function CreatorDashboard({ handle }: { handle: string }) {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    t('page_view', { scope: 'creator_dashboard', props: { handle } });
  }, [handle]);

  // 1) AuthZ via Cookie (kein Signieren/Timer)
  const { data: authz, error: authzErr, mutate: mutateAuthz } = useSWR(
    `/api/creator-authz?handle=${encodeURIComponent(handle)}`,
    async (u) => {
      try {
        return await fetchJSON(u, { credentials: 'include' as any });
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('HTTP 401') || msg.includes('HTTP 403') || msg.includes('HTTP 404')) return null;
        throw e;
      }
    },
    { revalidateOnFocus: true, revalidateOnReconnect: true }
  );
  const authorized = !!authz?.ok;
  const mustAuth = !authorized;

  // 2) Data nur wenn authorized
  const authedFetcher = (url: string) =>
    fetchJSON(url, { credentials: 'include' as any });

  const { data: threads } = useSWR(
    () => (authorized ? `/api/creator-threads?handle=${handle}` : null),
    authedFetcher,
    { refreshInterval: 12_000, revalidateOnFocus: true }
  );

  const { data: stats } = useSWR(
    () => (authorized ? `/api/creator-stats?handle=${handle}` : null),
    authedFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true }
  );

  const { data: settings, mutate: mutateSettings } = useSWR(
    () => (authorized ? `/api/creator-settings?handle=${handle}` : null),
    (u) => fetchJSON(u, { credentials: 'include' as any })
  );

  // lokale Settings
  const [price, setPrice] = useState<number>(20);
  const [replyWindowHours, setReplyWindowHours] = useState<number>(48);
  const [displayName, setDisplayName] = useState<string>('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>('');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [email, setEmail] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (authorized && settings) {
      setPrice(settings.price ?? 20);
      setReplyWindowHours(settings.replyWindowHours ?? 48);
      setDisplayName(settings.displayName ?? '');
      setAvatarDataUrl(settings.avatarDataUrl ?? '');
      setEmail(settings.email ?? '');
      t('creator_dash_settings_loaded', { scope: 'creator_dashboard', props: { handle } });
    }
  }, [authorized, settings, handle]);

  const totals = useMemo(() => {
    const g = threads?.grouped || {};
    return {
      open: g.open?.length || 0,
      answered: g.answered?.length || 0,
      refunded: g.refunded?.length || 0,
      all: g.all?.length || 0,
    };
  }, [threads]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const refLink =
    authorized && settings?.refCode
      ? `${baseUrl}/creator/join?ref=${settings.refCode}`
      : '';

  async function startSession() {
    // 1x kurz signieren → Cookie holen
    const hdrs = await signAuthHeaders(wallet as any);
    if (!hdrs) {
      alert('Connect a wallet that supports message signing.');
      return;
    }
    const r = await fetch(
      `/api/creator-session/start?handle=${encodeURIComponent(handle)}`,
      { method: 'POST', headers: hdrs, credentials: 'include' }
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      t('creator_session_start_error', { scope: 'creator_dashboard', props: { handle, err: j?.error || 'unknown' } });
      alert(j?.error || 'Authorization failed');
      return;
    }
    t('creator_session_start_ok', { scope: 'creator_dashboard', props: { handle } });
    await mutateAuthz();
  }

  async function endSession() {
    await fetch('/api/creator-session/end', { method: 'POST', credentials: 'include' });
    t('creator_session_end', { scope: 'creator_dashboard', props: { handle } });
    await mutateAuthz();
  }

  async function saveSettings(extra?: Record<string, any>) {
    if (!authorized) { alert('Not authorized.'); return; }
    setSaveStatus('saving');
    const body = { handle, price, replyWindowHours, displayName, email, ...(extra || {}) };
    t('creator_settings_save_attempt', { scope: 'creator_dashboard', props: { handle } });
    const r = await fetch('/api/creator-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      t('creator_settings_save_success', { scope: 'creator_dashboard', props: { handle } });
      mutateSettings();
      setSaveStatus('saved');
    } else {
      const j = await r.json().catch(() => ({}));
      t('creator_settings_save_error', { scope: 'creator_dashboard', props: { handle, err: j?.error || 'unknown' } });
      alert(j?.error || 'Failed to save');
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 1500);
  }

  async function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!authorized) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { alert('Image too large. Please use < 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') {
        setAvatarDataUrl(result);
        setSavingAvatar(true);
        t('creator_avatar_upload_attempt', { scope: 'creator_dashboard', props: { handle, size: file.size } });
        try {
          const r = await fetch('/api/creator-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ handle, price, replyWindowHours, displayName, avatarDataUrl: result }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            t('creator_avatar_upload_error', { scope: 'creator_dashboard', props: { handle, err: j?.error || 'unknown' } });
            alert(j?.error || 'Failed to upload avatar');
          } else {
            t('creator_avatar_upload_success', { scope: 'creator_dashboard', props: { handle } });
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

  return (
    <div className="min-h-screen bg-background text-white">
      {/* GLOBAL HEADER */}
      <header className="sticky top-0 z-30 bg-background/60 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-8 w-8 rounded-xl border border-white/10 object-contain"
            />
            <span className="font-bold tracking-tight group-hover:opacity-80 transition">
              Reply or Refund
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-8 !px-3 !py-0 !text-sm !shadow" />
            {authorized && (
              <button
                className="text-xs px-3 py-1 rounded-full border border-white/20 hover:bg-white/10"
                onClick={endSession}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* GATE */}
      {!authorized ? (
        <main className="max-w-5xl mx-auto px-4 py-16">
          <div className="max-w-lg mx-auto card p-6 text-center">
            <div className="text-lg font-semibold mb-1">Creator dashboard</div>
            <div className="text-sm text-white/60">
              Connect the creator wallet bound to <b>@{handle}</b> and sign once to start a 60-minute session.
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-9 !px-4 !py-0 !text-sm !shadow" />
              <button className="btn" onClick={startSession}>Sign in</button>
            </div>
            {authzErr && (
              <div className="mt-4 text-[11px] text-red-300/80">
                Access denied. Make sure you're connected with the bound creator wallet.
              </div>
            )}
            {!authz && (
              <div className="mt-4 text-[11px] text-white/50">
                You cannot view any creator dashboard except your own (wallet-bound).
              </div>
            )}
          </div>
        </main>
      ) : (
        <>
          {/* DASHBOARD HEADER */}
          <header className="z-20 bg-background/60 backdrop-blur border-b border-white/10">
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
                  <div className="text-2xl font-bold">€{(stats?.revenue?.mtd ?? 0).toFixed(2)}</div>
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
                renderItem={(tItem: any) => (
                  <div
                    key={tItem.id}
                    className="p-3 rounded-xl border border-white/10 flex items-center justify-between bg-white/5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{tItem.id.slice(0, 8)}…</div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                          {`€${Number(tItem.amount || 0).toFixed(2)}`}
                        </span>
                        <span
                          className={
                            'text-[10px] px-2 py-0.5 rounded-full ' +
                            (tItem.status === 'open'
                              ? 'bg-emerald-400/10 text-emerald-50 border border-emerald-400/40'
                              : tItem.status === 'answered'
                              ? 'bg-white/10 text-white/80 border border-white/15'
                              : 'bg-red-400/10 text-red-50 border border-red-400/25')
                          }
                        >
                          {tItem.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-white/40">
                        {tItem.messagesCount} msgs
                        {tItem.status === 'open' && <> · ⏳ {formatRemaining(tItem.remainingMs)} left</>}
                        {tItem.fanPubkey ? <> · fan: {tItem.fanPubkey.slice(0, 6)}…</> : null}
                      </div>
                    </div>
                    <Link
                      href={`/c/${tItem.id}`}
                      className="btn"
                      onClick={() =>
                        t('creator_open_chat_click', { scope: 'creator_dashboard', props: { threadId: tItem.id } })
                      }
                    >
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

                <label className="text-sm text-white/50">Email (ops/payout contact)</label>
                <input
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

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
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save'}
                </button>
                {saveStatus === 'error' && (
                  <div className="text-[11px] text-red-300 text-center">Save failed</div>
                )}
              </div>

              {/* referral */}
              <div className="card p-4 space-y-3 relative">
                <div className="font-semibold">Invite another creator</div>
                <p className="text-sm text-white/45">
                  Share this link. Other creators will start onboarding with your referral code.
                </p>
                <div className="input break-all">{refLink || 'Loading…'}</div>
                <button
                  className="btn w-full"
                  onClick={() => {
                    if (refLink) {
                      navigator.clipboard.writeText(refLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                      t('ref_share_click', { scope: 'creator_dashboard', props: { handle } });
                    }
                  }}
                >
                  Copy link
                </button>
                {copied && (
                  <div className="absolute -top-2 right-3 text-[11px] px-2 py-1 rounded-md bg-white text-black shadow">
                    Copied
                  </div>
                )}
              </div>
            </aside>
          </main>
        </>
      )}
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
  useEffect(() => {
    t('creator_tab_switch', { scope: 'creator_dashboard', props: { tab: active } });
  }, [active]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tItem) => (
          <button
            key={tItem.key}
            onClick={() => setActive(tItem.key)}
            className={
              'px-3 py-1 rounded-full text-sm border ' +
              (active === tItem.key ? 'bg-white text-black border-transparent' : 'border-white/20')
            }
          >
            {tItem.label}
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

