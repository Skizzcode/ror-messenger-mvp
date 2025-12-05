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

  // 1) AuthZ via Cookie/headers (capture errors for verification gating)
  const { data: authz, error: authzErr, mutate: mutateAuthz } = useSWR(
    `/api/creator-authz?handle=${encodeURIComponent(handle)}`,
    async (u) => {
      const r = await fetch(u, { credentials: 'include' as any });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, ...j };
    },
    { revalidateOnFocus: true, revalidateOnReconnect: true }
  );
  const authorized = !!authz?.ok;
  const needsVerification = authz?.error === 'EMAIL_NOT_VERIFIED' || authz?.needsVerification;
  const adminBypass = !!authz?.adminBypass;
  const mustAuth = !authorized && !needsVerification;

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
  const [toast, setToast] = useState<string | null>(null);
  const [fastPrice, setFastPrice] = useState<number | null>(null);
  const [fastReplyWindow, setFastReplyWindow] = useState<number | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [refStats, setRefStats] = useState<any>(null);
  const [refStatsLoading, setRefStatsLoading] = useState(false);
  const [theme, setTheme] = useState<'diamond' | 'pearl'>('diamond');

  useEffect(() => {
    if (authorized && settings) {
      setPrice(settings.price ?? 20);
      setReplyWindowHours(settings.replyWindowHours ?? 48);
      setDisplayName(settings.displayName ?? '');
      setAvatarDataUrl(settings.avatarDataUrl ?? '');
      setEmail(settings.email ?? '');
      setFastPrice(settings.fastPrice ?? null);
      setFastReplyWindow(settings.fastReplyWindowHours ?? null);
      setOffers(settings.offers || []);
      t('creator_dash_settings_loaded', { scope: 'creator_dashboard', props: { handle } });
    }
  }, [authorized, settings, handle]);

  // Load referral stats once (requires signed headers)
  useEffect(() => {
    let stop = false;
    async function loadRefStats() {
      if (!authorized || !wallet.publicKey || !settings?.refCode) return;
      setRefStatsLoading(true);
      try {
        const hdrs = await signAuthHeaders(wallet as any);
        const r = await fetch(`/api/ref-stats?code=${encodeURIComponent(settings.refCode)}`, {
          headers: { ...(hdrs || {}) },
          credentials: 'include' as any,
        });
        const j = await r.json().catch(() => ({}));
        if (!stop && j?.ok) {
          setRefStats(j);
        }
      } catch {
        if (!stop) setRefStats(null);
      } finally {
        if (!stop) setRefStatsLoading(false);
      }
    }
    loadRefStats();
    return () => {
      stop = true;
    };
  }, [authorized, wallet.publicKey, settings?.refCode]);

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
  const origin = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || '';
  const refLink =
    authorized && settings?.refCode
      ? `${baseUrl}/creator/join?ref=${settings.refCode}`
      : '';
  const chatLink = `${origin}/c/${handle}`;

  const completeness = useMemo(() => {
    const checks = [
      !!displayName,
      !!avatarDataUrl,
      !!email,
      Number(price) > 0,
      Number(replyWindowHours) > 0,
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [displayName, avatarDataUrl, email, price, replyWindowHours]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function startSession() {
    // 1x kurz signieren -> Cookie holen
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
    const body = {
      handle,
      price,
      replyWindowHours,
      displayName,
      email,
      ...(fastPrice ? { fastPrice } : {}),
      ...(fastReplyWindow ? { fastReplyWindowHours: fastReplyWindow } : {}),
      offers,
      ...(extra || {}),
    };
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
      showToast('Settings saved');
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
            showToast('Avatar updated');
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

  const isPearl = theme === 'pearl';
  const surface = isPearl
    ? 'bg-white text-black border border-black/10 shadow-[0_20px_80px_rgba(0,0,0,0.12)]'
    : 'bg-white/5 text-white border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.35)]';
  const labelTone = isPearl ? 'text-black/60' : 'text-white/60';
  const hintTone = isPearl ? 'text-black/45' : 'text-white/45';
  const dividerTone = isPearl ? 'bg-black/10' : 'bg-white/10';
  const inputTone = isPearl
    ? '!bg-black/5 !border-black/10 !text-black placeholder:!text-black/40'
    : '!bg-white/5 !border-white/10 !text-white placeholder:!text-white/40';
  const textareaTone = isPearl
    ? 'bg-black/5 border border-black/10 text-black placeholder:text-black/40'
    : 'bg-white/5 border border-white/10 text-white placeholder:text-white/40';

  return (
    <div className={`min-h-screen ${isPearl ? 'bg-white text-black' : 'bg-background text-white'}`}>
      {/* GLOBAL HEADER */}
      <header className="sticky top-0 z-30 bg-background/60 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-12 w-12 rounded-2xl  object-contain"
            />
            <span className="font-bold tracking-tight group-hover:opacity-80 transition">
              Reply or Refund
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-3 py-1 rounded-full border border-white/20 hover:bg-white/10"
              onClick={() => setTheme((t) => (t === 'pearl' ? 'diamond' : 'pearl'))}
            >
              {isPearl ? 'Black diamond' : 'White pearl'}
            </button>
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
      {!authorized && !adminBypass ? (
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
      ) : needsVerification && !adminBypass ? (
        <main className="max-w-5xl mx-auto px-4 py-16">
          <div className="max-w-lg mx-auto card p-6 space-y-4 text-center">
            <div className="text-lg font-semibold">Verify your email</div>
            <p className="text-sm text-white/60">Enter the verification code we sent to your email to unlock your dashboard.</p>
            <VerificationForm handle={handle} onVerified={() => mutateAuthz()} />
          </div>
        </main>
      ) : (
        <>
          {/* DASHBOARD HEADER */}
          <header className={`z-20 backdrop-blur border-b ${isPearl ? 'bg-white/70 border-black/5 text-black' : 'bg-background/60 border-white/10'}`}>
            <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={avatarDataUrl || '/logo-ror-glass.svg'}
                  className="h-12 w-12 rounded-2xl  object-cover"
                  alt="Creator avatar"
                />
                <div>
                  <div className="font-black text-lg">
                    {displayName ? displayName : `@${handle}`}
                  </div>
                  <div className={`text-xs ${isPearl ? 'text-black/50' : 'text-white/35'}`}>Creator dashboard</div>
                </div>
              </div>
              <div className={`text-sm ${isPearl ? 'text-black/50' : 'text-white/40'}`}>@{handle}</div>
            </div>
          </header>

          {/* MAIN */}
          <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
            {/* LEFT */}
            <section className="md:col-span-2 space-y-6">
              {/* Session / trust strip */}
              <div className={`p-3 rounded-2xl flex flex-wrap items-center gap-3 justify-between ${surface}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-100 border border-emerald-400/30 text-[11px]">
                    Session active
                  </span>
                  <span className="px-2 py-1 rounded-full bg-white/5 text-white/70 border border-white/10 text-[11px]">
                    {`${replyWindowHours}h reply - auto refund`}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-white/5 text-white/70 border border-white/10 text-[11px]">
                    {email ? 'Email on file' : 'Add email for ops'}
                  </span>
                </div>
                <div className="text-[11px] text-white/50">
                  Fans see your SLA badge. Keep replies inside the window to unlock escrow.
                </div>
              </div>

              {/* Profile completeness */}
              <div className="card p-4 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Profile completeness</span>
                  <span className="text-xs text-white/60">{completeness}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all"
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <div className="text-[11px] text-white/50">
                  Fill email, name, avatar, price, reply window to boost trust on your public page.
                </div>
              </div>

              {/* STATS */}
              <div className="grid grid-cols-4 gap-3">
                <div className={`p-3 rounded-xl col-span-4 md:col-span-2 ${surface}`}>
                  <div className={`text-xs ${isPearl ? 'text-black/50' : 'text-white/40'}`}>Earnings (MTD)</div>
                  <div className="text-2xl font-bold">EUR {(stats?.revenue?.mtd ?? 0).toFixed(2)}</div>
                  <div className={`text-xs mt-1 ${isPearl ? 'text-black/50' : 'text-white/40'}`}>
                    All-time: EUR {(stats?.revenue?.allTime ?? 0).toFixed(2)}
                  </div>
                </div>
                <Stat label="Open" value={totals.open} isPearl={isPearl} />
                <Stat label="Answered" value={totals.answered} isPearl={isPearl} />
                <Stat label="Refunded" value={totals.refunded} isPearl={isPearl} />
                <Stat label="All" value={totals.all} isPearl={isPearl} />
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
                    className={`p-3 rounded-xl flex items-center justify-between ${surface}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{tItem.id.slice(0, 8)}...</div>
                        <span className={`${isPearl ? 'text-[10px] px-2 py-0.5 rounded-full bg-black/5 border border-black/10' : 'text-[10px] px-2 py-0.5 rounded-full bg-white/10'}`}>
                          {`EUR ${Number(tItem.amount || 0).toFixed(2)}`}
                        </span>
                        <span
                          className={
                            'text-[10px] px-2 py-0.5 rounded-full ' +
                            (tItem.status === 'open'
                              ? 'bg-emerald-400/10 text-emerald-50 border border-emerald-400/40'
                              : tItem.status === 'answered'
                              ? isPearl ? 'bg-black/5 text-black border border-black/10' : 'bg-white/10 text-white/80 border border-white/15'
                              : 'bg-red-400/10 text-red-50 border border-red-400/25')
                          }
                        >
                          {tItem.status.toUpperCase()}
                        </span>
                      </div>
                      <div className={`text-xs ${isPearl ? 'text-black/60' : 'text-white/40'} space-y-1`}>
                        <div>
                          {tItem.messagesCount} msgs
                          {tItem.status === 'open' && <> - {formatRemaining(tItem.remainingMs)} left</>}
                          {tItem.fanPubkey ? <> - fan: {tItem.fanPubkey.slice(0, 6)}...</> : null}
                        </div>
                        {tItem.lastMessageBody && (
                          <div className={`${isPearl ? 'text-black/70' : 'text-white/65'} text-[11px] line-clamp-1`}>
                            Last {tItem.lastMessageFrom}: {tItem.lastMessageBody}
                          </div>
                        )}
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
              <div className={`${surface} p-4 space-y-4 rounded-2xl`}>
                <div className="font-semibold text-lg">Profile</div>

                <label className={`text-sm ${labelTone}`}>Email (ops/payout contact)</label>
                <input
                  className={`input ${inputTone}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <label className={`text-sm ${labelTone}`}>Display name</label>
                <input
                  className={`input ${inputTone}`}
                  placeholder="Your public name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />

                <label className={`text-sm ${labelTone}`}>Avatar (upload)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onAvatarFileSelected}
                  className={`text-xs ${hintTone}`}
                />
                {savingAvatar && <div className={`text-[11px] ${hintTone}`}>Uploading...</div>}
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt="avatar" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className={`text-[11px] ${hintTone}`}>No avatar yet. Upload a small image.</div>
                )}

                <div className={`h-px ${dividerTone}`} />

                <div className="font-semibold text-lg">Chat settings</div>
                <label className={`text-sm ${labelTone}`}>Price (EUR / USDC equiv.)</label>
                <input
                  className={`input ${inputTone}`}
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />

                <label className={`text-sm ${labelTone}`}>Reply window (hours)</label>
                <input
                  className={`input ${inputTone}`}
                  type="number"
                  min={1}
                  value={replyWindowHours}
                  onChange={(e) => setReplyWindowHours(Number(e.target.value))}
                />

                <label className={`text-sm ${labelTone}`}>Fast Lane price (optional)</label>
                <input
                  className={`input ${inputTone}`}
                  type="number"
                  min={1}
                  value={fastPrice ?? ''}
                  onChange={(e) => setFastPrice(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="e.g. 1.5x your normal price"
                />

                <label className={`text-sm ${labelTone}`}>Fast Lane reply window (hours, optional)</label>
                <input
                  className={`input ${inputTone}`}
                  type="number"
                  min={1}
                  value={fastReplyWindow ?? ''}
                  onChange={(e) => setFastReplyWindow(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="e.g. 12"
                />

                <div className={`h-px ${dividerTone}`} />
                <div className="font-semibold text-lg">Custom offers (up to 2)</div>
                {[0, 1].map((i) => {
                  const o = offers[i] || { title: '', price: '', replyWindowHours: '', description: '' };
                  return (
                    <div
                      key={i}
                      className={`space-y-2 p-3 rounded-2xl ${
                        isPearl ? 'bg-black/5 border border-black/10' : 'bg-white/5 border border-white/10'
                      }`}
                    >
                      <label className={`text-sm ${labelTone}`}>Title</label>
                      <input
                        className={`input ${inputTone}`}
                        value={o.title}
                        placeholder="e.g. Deep dive"
                        onChange={(e) => {
                          const next = [...offers];
                          next[i] = { ...o, title: e.target.value };
                          setOffers(next);
                        }}
                      />
                      <label className={`text-sm ${labelTone}`}>Price (EUR)</label>
                      <input
                        className={`input ${inputTone}`}
                        type="number"
                        min={1}
                        value={o.price}
                        onChange={(e) => {
                          const next = [...offers];
                          next[i] = { ...o, price: Number(e.target.value) };
                          setOffers(next);
                        }}
                      />
                      <label className={`text-sm ${labelTone}`}>Reply window (hours)</label>
                      <input
                        className={`input ${inputTone}`}
                        type="number"
                        min={1}
                        value={o.replyWindowHours}
                        onChange={(e) => {
                          const next = [...offers];
                          next[i] = { ...o, replyWindowHours: Number(e.target.value) };
                          setOffers(next);
                        }}
                      />
                      <label className={`text-sm ${labelTone}`}>Description</label>
                      <textarea
                        className={`w-full rounded-xl px-3 py-2 text-sm ${textareaTone}`}
                        value={o.description}
                        onChange={(e) => {
                          const next = [...offers];
                          next[i] = { ...o, description: e.target.value };
                          setOffers(next);
                        }}
                      />
                    </div>
                  );
                })}

                <button className="btn w-full" onClick={() => saveSettings()}>
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
                </button>
                {saveStatus === 'saved' && (
                  <div className="text-[11px] text-emerald-200 text-center">Saved</div>
                )}
                {saveStatus === 'error' && (
                  <div className="text-[11px] text-red-300 text-center">Save failed</div>
                )}
              </div>

              {/* Referral earnings */}
              <div className={`${surface} p-4 space-y-3 rounded-2xl`}>
                <div className="font-semibold text-lg">Referral earnings</div>
                <div className={`text-sm ${hintTone}`}>
                  Earn from creators who onboard with your code.
                </div>
                <div
                  className={`p-3 rounded-2xl ${
                    isPearl ? 'bg-black/5 border border-black/10' : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <div className={`text-xs ${hintTone}`}>Creators referred</div>
                  <div className="text-xl font-semibold">
                    {refStatsLoading ? '...' : refStats?.creatorsCount ?? 0}
                  </div>
                  <div className={`text-xs mt-1 ${hintTone}`}>
                    Earned (answered): EUR {refStatsLoading ? '...' : (refStats?.totals?.revenueAnswered ?? 0).toFixed(2)}
                  </div>
                </div>
                <Link
                  href="/creator/join"
                  className={`text-[12px] underline ${isPearl ? 'text-emerald-600' : 'text-emerald-200'}`}
                >
                  How referrals work
                </Link>
              </div>

              {/* referral */}
              <div className={`${surface} p-4 space-y-3 relative rounded-2xl`}>
                <div className="font-semibold">Invite another creator</div>
                <p className={`text-sm ${hintTone}`}>
                  Share this link. Other creators will start onboarding with your referral code.
                </p>
                <div className={`input break-all ${inputTone}`}>{refLink || 'Loading...'}</div>
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
                  <div
                    className={`absolute -top-2 right-3 text-[11px] px-2 py-1 rounded-md shadow ${
                      isPearl ? 'bg-black text-white' : 'bg-white text-black'
                    }`}
                  >
                    Copied
                  </div>
                )}
              </div>

              {/* Share kit */}
              <div className={`${surface} p-4 space-y-3 rounded-2xl`}>
                <div className="font-semibold">Share your chat</div>
                <div className={`text-sm ${hintTone}`}>Copy your chat link or use the asset for socials.</div>
                <div className={`input break-all ${inputTone}`}>{chatLink}</div>
                <button
                  className="btn w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(chatLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  Copy chat link
                </button>
                <Link
                  href="/logo-ror-glass.svg"
                  className={`text-[12px] underline ${isPearl ? 'text-emerald-600' : 'text-emerald-200'}`}
                >
                  Download share asset
                </Link>
                {offers && offers.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <div className="text-sm font-semibold">Offer invite links</div>
                    {offers.map((o, idx) => {
                      const href = `${chatLink}?offer=${encodeURIComponent(o.id || idx)}`;
                      return (
                        <div
                          key={o.id || idx}
                          className={`text-[12px] space-y-1 ${isPearl ? 'text-black/70' : 'text-white/70'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span>
                              {o.title || 'Offer'} - EUR {Number(o.price || 0).toFixed(2)}
                            </span>
                            <button
                              className={`px-2 py-1 rounded-lg text-[11px] ${
                                isPearl ? 'bg-black text-white' : 'bg-white/10 text-white'
                              }`}
                              onClick={() => {
                                navigator.clipboard.writeText(href);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1600);
                              }}
                            >
                              Copy
                            </button>
                          </div>
                          <div className={`break-all ${hintTone}`}>{href}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </main>
        </>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-xl bg-white text-black text-sm shadow-lg border border-black/5">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl  text-center bg-white/5">
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

function VerificationForm({ handle, onVerified }: { handle: string; onVerified: () => void }) {
  const wallet = useWallet();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit() {
    if (!code.trim()) return;
    setStatus('submitting');
    try {
      const hdrs = await signAuthHeaders(wallet as any);
      if (!hdrs) {
        alert('Connect a wallet that supports message signing.');
        setStatus('idle');
        return;
      }
      const r = await fetch('/api/creator/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdrs },
        credentials: 'include',
        body: JSON.stringify({ handle, code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setStatus('error');
        alert(j?.error || 'Invalid code');
        return;
      }
      onVerified();
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="space-y-3">
      <input
        className="input text-center"
        placeholder="Verification code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button className="btn w-full" onClick={submit} disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Verifying...' : 'Verify email'}
      </button>
      <button
        className="btn w-full"
        onClick={async () => {
          setResendStatus('sending');
          try {
            const hdrs = await signAuthHeaders(wallet as any);
            if (!hdrs) {
              alert('Connect a wallet that supports message signing.');
              setResendStatus('idle');
              return;
            }
            const r = await fetch('/api/creator/send-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...hdrs },
              credentials: 'include',
              body: JSON.stringify({ handle }),
            });
            if (!r.ok) throw new Error('send_failed');
            setResendStatus('sent');
          } catch {
            setResendStatus('error');
          } finally {
            setTimeout(() => setResendStatus('idle'), 1500);
          }
        }}
        disabled={resendStatus === 'sending'}
      >
        {resendStatus === 'sending' ? 'Sending...' : resendStatus === 'sent' ? 'Sent' : 'Resend code'}
      </button>
      <div className="text-[11px] text-white/50">We require email verification to protect creators and fans.</div>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.handle } };
}

















