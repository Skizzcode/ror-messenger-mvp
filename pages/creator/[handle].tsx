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
  const shell = isPearl
    ? 'bg-gradient-to-br from-[#f7f9ff] via-white to-[#eef2ff] text-[#0b1220]'
    : 'bg-gradient-to-br from-[#05060d] via-[#0c1224] to-[#05070f] text-white';
  const glass = isPearl
    ? 'bg-white/90 border border-black/5 shadow-[0_25px_90px_rgba(15,23,42,0.08)]'
    : 'bg-white/5 border border-white/10 shadow-[0_30px_120px_rgba(0,0,0,0.55)]';
  const softGlass = isPearl
    ? 'bg-black/5 border border-black/10'
    : 'bg-white/5 border border-white/10';
  const labelTone = isPearl ? 'text-slate-700' : 'text-white/70';
  const hintTone = isPearl ? 'text-slate-500' : 'text-white/50';
  const mutedTone = isPearl ? 'text-slate-600' : 'text-white/60';
  const dividerTone = isPearl ? 'bg-black/5' : 'bg-white/10';
  const inputTone = isPearl
    ? '!bg-white !border-black/10 !text-black placeholder:!text-slate-400'
    : '!bg-white/5 !border-white/10 !text-white placeholder:!text-white/40';
  const textareaTone = isPearl
    ? 'bg-white border border-black/10 text-black placeholder:text-slate-400'
    : 'bg-white/5 border border-white/10 text-white placeholder:text-white/40';
  const pill = isPearl ? 'bg-black/5 text-black border border-black/10' : 'bg-white/10 text-white border border-white/10';

  return (
    <div className={`min-h-screen relative overflow-hidden ${shell}`}>
      <div className="pointer-events-none absolute -top-24 -right-16 h-80 w-80 bg-emerald-400/25 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute top-10 -left-10 h-64 w-64 bg-cyan-400/20 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_18%_22%,#ffffff,transparent_26%),radial-gradient(circle_at_82%_0%,#7cffe0,transparent_20%)]" />

      <header className={`sticky top-0 z-40 border-b backdrop-blur ${isPearl ? 'bg-white/60 border-black/5' : 'bg-[#05060d]/70 border-white/10'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-11 w-11 rounded-2xl object-contain shadow-lg"
            />
            <div>
              <div className="font-bold tracking-tight group-hover:opacity-80 transition">Reply or Refund</div>
              <div className={`text-[11px] uppercase tracking-[0.15em] ${mutedTone}`}>Creator OS</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-3 py-1 rounded-full border border-white/20 hover:opacity-80 transition"
              onClick={() => setTheme((tTheme) => (tTheme === 'pearl' ? 'diamond' : 'pearl'))}
            >
              {isPearl ? 'Switch to Diamond' : 'Switch to Pearl'}
            </button>
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-9 !px-3 !py-0 !text-sm !shadow" />
            {authorized && (
              <button
                className="text-xs px-3 py-1 rounded-full border border-white/20 hover:opacity-80 transition"
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
        <main className="max-w-4xl mx-auto px-4 py-16 relative z-10">
          <div className={`max-w-xl mx-auto ${glass} rounded-3xl p-8 text-center relative overflow-hidden`}>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 via-transparent to-cyan-400/5 pointer-events-none" />
            <div className="text-xs uppercase tracking-[0.2em] font-semibold text-emerald-300">Creator Access</div>
            <div className="text-2xl font-black mt-2">Unlock your command center</div>
            <div className={`${mutedTone} text-sm mt-2`}>
              Connect the wallet bound to <b>@{handle}</b> and sign once to start a 60-minute session.
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-9 !px-4 !py-0 !text-sm !shadow" />
              <button className="btn" onClick={startSession}>Sign in</button>
            </div>
            {authzErr && (
              <div className="mt-4 text-[11px] text-red-400">
                Access denied. Make sure you're connected with the bound creator wallet.
              </div>
            )}
            {!authz && (
              <div className="mt-4 text-[11px] text-white/60">
                You cannot view any creator dashboard except your own (wallet-bound).
              </div>
            )}
          </div>
        </main>
      ) : needsVerification && !adminBypass ? (
        <main className="max-w-4xl mx-auto px-4 py-16 relative z-10">
          <div className={`max-w-xl mx-auto ${glass} rounded-3xl p-8 space-y-5 text-center`}>
            <div className="text-xs uppercase tracking-[0.2em] font-semibold text-emerald-300">Trust layer</div>
            <div className="text-2xl font-black">Verify your email</div>
            <p className={`${mutedTone} text-sm`}>
              Enter the verification code we sent to your email to unlock your dashboard.
            </p>
            <VerificationForm handle={handle} onVerified={() => mutateAuthz()} />
          </div>
        </main>
      ) : (
        <>
          {/* DASHBOARD */}
          <main className="max-w-6xl mx-auto px-4 py-8 space-y-7 relative z-10">
            <section className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* HERO */}
                <div className={`${glass} rounded-3xl p-6 lg:p-7 relative overflow-hidden`}>
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-400/10 via-transparent to-cyan-400/10" />
                  <div className="relative flex flex-wrap items-start justify-between gap-6">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em]">
                        <span className={`px-3 py-1 rounded-full ${pill}`}>Creator OS</span>
                        <span className={`px-3 py-1 rounded-full ${pill}`}>{replyWindowHours}h reply SLA</span>
                        <span className={`px-3 py-1 rounded-full ${pill}`}>{email ? 'Email on file' : 'Add ops email'}</span>
                      </div>
                      <div>
                        <div className="text-3xl font-black leading-tight flex items-center gap-2">
                          Creator command center
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isPearl ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/20'}`}>
                            @{handle}
                          </span>
                        </div>
                        <p className={`${mutedTone} text-sm mt-2 max-w-2xl`}>
                          Everything you need to keep replies inside SLA, showcase your profile, and grow referrals without digging through settings.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          className="btn"
                          onClick={() => {
                            navigator.clipboard.writeText(chatLink);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                            showToast('Chat link copied');
                          }}
                        >
                          Copy chat link
                        </button>
                        {refLink && (
                          <button
                            className="btn"
                            onClick={() => {
                              navigator.clipboard.writeText(refLink);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 1600);
                              showToast('Referral link copied');
                            }}
                          >
                            Copy referral link
                          </button>
                        )}
                        <button
                          className={`px-4 py-2 rounded-full text-sm border transition ${isPearl ? 'border-black/10 hover:bg-black/5' : 'border-white/20 hover:bg-white/10'}`}
                          onClick={() => saveSettings()}
                        >
                          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                    <div className={`p-4 rounded-2xl min-w-[240px] ${softGlass}`}>
                      <div className="flex items-center gap-3">
                        <img
                          src={avatarDataUrl || '/logo-ror-glass.svg'}
                          className="h-12 w-12 rounded-2xl object-cover border border-white/10"
                          alt="Creator avatar"
                        />
                        <div>
                          <div className="font-semibold text-lg">{displayName || `@${handle}`}</div>
                          <div className={`text-xs ${mutedTone}`}>Session active · {replyWindowHours}h SLA</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className={mutedTone}>Profile completeness</span>
                          <span className={mutedTone}>{completeness}%</span>
                        </div>
                        <div className={`h-2 mt-2 rounded-full overflow-hidden ${isPearl ? 'bg-black/5' : 'bg-white/10'}`}>
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-300 transition-all"
                            style={{ width: `${completeness}%` }}
                          />
                        </div>
                        <p className={`text-[11px] mt-2 ${mutedTone}`}>
                          Fill name, avatar, email, price and reply window to boost trust on your public page.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat label="Earnings (MTD)" value={`EUR ${(stats?.revenue?.mtd ?? 0).toFixed(2)}`} isPearl={isPearl} />
                    <Stat label="Earnings (all time)" value={`EUR ${(stats?.revenue?.allTime ?? 0).toFixed(2)}`} isPearl={isPearl} />
                    <Stat label="Open threads" value={totals.open} isPearl={isPearl} />
                    <Stat label="Answered" value={totals.answered} isPearl={isPearl} />
                  </div>
                </div>

                {/* THREADS */}
                <div className={`${glass} rounded-3xl p-6 space-y-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Inbox & threads</div>
                      <p className={`${mutedTone} text-xs`}>Live view · refreshes every 12s</p>
                    </div>
                    <div className={`text-[11px] px-3 py-1 rounded-full ${pill}`}>
                      Escrow unlocks after you answer inside SLA
                    </div>
                  </div>
                  <Tabs
                    tabs={[
                      { key: 'open', label: 'Open', items: threads?.grouped?.open || [] },
                      { key: 'answered', label: 'Answered', items: threads?.grouped?.answered || [] },
                      { key: 'refunded', label: 'Refunded', items: threads?.grouped?.refunded || [] },
                    ]}
                    renderItem={(tItem: any) => (
                      <div
                        key={tItem.id}
                        className={`p-4 rounded-2xl flex flex-col gap-3 border ${isPearl ? 'bg-white/80 border-black/5 shadow-sm' : 'bg-white/5 border-white/10'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-semibold text-lg">#{tItem.id.slice(0, 8)}</div>
                              <span className="px-2 py-1 text-[11px] rounded-full bg-emerald-400/20 text-emerald-900 dark:text-emerald-50 border border-emerald-400/30">
                                EUR {Number(tItem.amount || 0).toFixed(2)}
                              </span>
                              <span
                                className={
                                  'text-[11px] px-2 py-1 rounded-full border ' +
                                  (tItem.status === 'open'
                                    ? 'bg-amber-400/10 text-amber-700 border-amber-400/30 dark:text-amber-100'
                                    : tItem.status === 'answered'
                                    ? 'bg-emerald-400/10 text-emerald-700 border-emerald-400/25 dark:text-emerald-100'
                                    : 'bg-red-400/10 text-red-700 border-red-400/25 dark:text-red-100')
                                }
                              >
                                {tItem.status.toUpperCase()}
                              </span>
                            </div>
                            <div className={`text-xs ${mutedTone}`}>
                              {tItem.messagesCount} msgs
                              {tItem.status === 'open' && <> · {formatRemaining(tItem.remainingMs)} left</>}
                              {tItem.fanPubkey ? <> · fan: {tItem.fanPubkey.slice(0, 6)}...</> : null}
                            </div>
                            {tItem.lastMessageBody && (
                              <div className={`${isPearl ? 'text-slate-800' : 'text-white/80'} text-[12px] line-clamp-1`}>
                                Last {tItem.lastMessageFrom}: {tItem.lastMessageBody}
                              </div>
                            )}
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
                      </div>
                    )}
                  />
                </div>

                {/* SHARE KIT */}
                <div className={`${glass} rounded-3xl p-6 space-y-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Share & invites</div>
                      <p className={`${mutedTone} text-xs`}>Ready-to-use links for fans and referrals.</p>
                    </div>
                    <div className={`text-[11px] px-3 py-1 rounded-full ${pill}`}>High-trust links</div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className={`${labelTone} text-sm`}>Chat link</div>
                      <div className={`input break-all ${inputTone}`}>{chatLink}</div>
                      <div className="flex gap-2">
                        <button
                          className="btn w-full"
                          onClick={() => {
                            navigator.clipboard.writeText(chatLink);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                            showToast('Chat link copied');
                          }}
                        >
                          Copy chat link
                        </button>
                        <Link
                          href="/logo-ror-glass.svg"
                          className={`px-4 py-2 rounded-2xl text-sm text-center border ${isPearl ? 'border-black/10 hover:bg-black/5' : 'border-white/20 hover:bg-white/10'}`}
                        >
                          Asset
                        </Link>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className={`${labelTone} text-sm`}>Referral link</div>
                      <div className={`input break-all ${inputTone}`}>{refLink || 'Generating your code...'}</div>
                      <button
                        className="btn w-full"
                        onClick={() => {
                          if (refLink) {
                            navigator.clipboard.writeText(refLink);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                            showToast('Referral link copied');
                            t('ref_share_click', { scope: 'creator_dashboard', props: { handle } });
                          }
                        }}
                      >
                        Copy referral link
                      </button>
                    </div>
                  </div>
                  {offers && offers.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <div className="text-sm font-semibold">Offer invite links</div>
                      <div className={`${mutedTone} text-xs`}>Each link opens chat with a preselected offer.</div>
                      <div className="space-y-2">
                        {offers.map((o, idx) => {
                          const href = `${chatLink}?offer=${encodeURIComponent(o.id || idx)}`;
                          return (
                            <div
                              key={o.id || idx}
                              className={`flex flex-col gap-1 p-3 rounded-2xl border ${isPearl ? 'border-black/10 bg-black/5' : 'border-white/10 bg-white/5'}`}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm font-semibold">
                                  {o.title || 'Offer'} · EUR {Number(o.price || 0).toFixed(2)}
                                </span>
                                <button
                                  className={`px-3 py-1 rounded-full text-[11px] ${isPearl ? 'bg-black text-white' : 'bg-white/10 text-white'}`}
                                  onClick={() => {
                                    navigator.clipboard.writeText(href);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 1600);
                                  }}
                                >
                                  Copy
                                </button>
                              </div>
                              <div className={`text-[12px] break-all ${hintTone}`}>{href}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <aside className="space-y-6">
                <div className={`${glass} p-5 rounded-3xl space-y-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Identity & ops</div>
                      <p className={`${mutedTone} text-xs`}>How fans see you and how we reach you.</p>
                    </div>
                    <div className={`text-[11px] px-3 py-1 rounded-full ${pill}`}>Public card</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={`text-sm ${labelTone}`}>Display name</label>
                      <input
                        className={`input ${inputTone}`}
                        placeholder="Your public name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={`text-sm ${labelTone}`}>Email (ops/payout contact)</label>
                      <input
                        className={`input ${inputTone}`}
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={`h-px ${dividerTone}`} />

                  <div className="flex items-start gap-3">
                    <div className="space-y-2 flex-1">
                      <label className={`text-sm ${labelTone}`}>Avatar (upload)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onAvatarFileSelected}
                        className="text-xs"
                      />
                      {savingAvatar && <div className={`text-[11px] ${hintTone}`}>Uploading...</div>}
                      {avatarDataUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={avatarDataUrl} alt="avatar" className="h-12 w-12 rounded-full object-cover" />
                          <div className={`text-[12px] ${mutedTone}`}>Looks good in chat + dashboard</div>
                        </div>
                      ) : (
                        <div className={`text-[11px] ${hintTone}`}>No avatar yet. Upload a small image (&lt;1MB).</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <div className="text-xs font-semibold mb-2">Status</div>
                      <div className="flex flex-col gap-2">
                        <span className={`px-3 py-1 rounded-full text-[11px] ${pill}`}>
                          Session: {authorized ? 'Active' : 'Not signed'}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-[11px] ${pill}`}>
                          Email: {email ? 'On file' : 'Missing'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${glass} p-5 rounded-3xl space-y-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Pricing & SLA</div>
                      <p className={`${mutedTone} text-xs`}>Tune speed vs. earnings.</p>
                    </div>
                    <div className={`text-[11px] px-3 py-1 rounded-full ${pill}`}>Escrow tied</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={`text-sm ${labelTone}`}>Price (EUR / USDC equiv.)</label>
                      <input
                        className={`input ${inputTone}`}
                        type="number"
                        min={1}
                        value={price}
                        onChange={(e) => setPrice(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={`text-sm ${labelTone}`}>Reply window (hours)</label>
                      <input
                        className={`input ${inputTone}`}
                        type="number"
                        min={1}
                        value={replyWindowHours}
                        onChange={(e) => setReplyWindowHours(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={`text-sm ${labelTone}`}>Fast Lane price (optional)</label>
                      <input
                        className={`input ${inputTone}`}
                        type="number"
                        min={1}
                        value={fastPrice ?? ''}
                        onChange={(e) => setFastPrice(e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 1.5x your normal price"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={`text-sm ${labelTone}`}>Fast Lane reply window (hours)</label>
                      <input
                        className={`input ${inputTone}`}
                        type="number"
                        min={1}
                        value={fastReplyWindow ?? ''}
                        onChange={(e) => setFastReplyWindow(e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 12"
                      />
                    </div>
                  </div>
                  <div className="pt-1">
                    <button className="btn w-full" onClick={() => saveSettings()}>
                      {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save pricing'}
                    </button>
                    {saveStatus === 'saved' && (
                      <div className="text-[11px] text-emerald-600 text-center mt-2">Saved</div>
                    )}
                    {saveStatus === 'error' && (
                      <div className="text-[11px] text-red-500 text-center mt-2">Save failed</div>
                    )}
                  </div>
                </div>

                <div className={`${glass} p-5 rounded-3xl space-y-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Custom offers (up to 2)</div>
                      <p className={`${mutedTone} text-xs`}>Set themed responses like deep dives or audio replies.</p>
                    </div>
                    <div className={`text-[11px] px-3 py-1 rounded-full ${pill}`}>Optional</div>
                  </div>
                  {[0, 1].map((i) => {
                    const o = offers[i] || { title: '', price: '', replyWindowHours: '', description: '' };
                    return (
                      <div
                        key={i}
                        className={`space-y-2 p-4 rounded-2xl border ${isPearl ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
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
                          </div>
                          <div className="space-y-1">
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
                          </div>
                          <div className="space-y-1">
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
                          </div>
                          <div className="space-y-1">
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
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn w-full" onClick={() => saveSettings()}>
                    Save offers
                  </button>
                </div>

                <div className={`${glass} p-5 rounded-3xl space-y-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Referral earnings</div>
                      <p className={`${mutedTone} text-xs`}>Earn from creators who onboard with your code.</p>
                    </div>
                    <div className={`text-[11px] px-3 py-1 rounded-full ${pill}`}>Passive</div>
                  </div>
                  <div
                    className={`p-4 rounded-2xl border ${isPearl ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}
                  >
                    <div className={`text-xs ${hintTone}`}>Creators referred</div>
                    <div className="text-2xl font-semibold mt-1">
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
              </aside>
            </section>
          </main>
        </>
      )}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-xl text-sm shadow-lg border ${isPearl ? 'bg-slate-900 text-white border-black/5' : 'bg-white text-black border-black/5'}`}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, isPearl }: { label: string; value: number | string; isPearl?: boolean }) {
  return (
    <div
      className={`p-4 rounded-2xl border text-left ${
        isPearl ? 'bg-white/90 border-black/5 shadow-sm' : 'bg-white/5 border-white/10'
      }`}
    >
      <div className="text-xs uppercase tracking-[0.12em] text-emerald-400">Live</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      <div className={`${isPearl ? 'text-slate-600' : 'text-white/60'} text-xs mt-1`}>{label}</div>
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
              'px-4 py-2 rounded-full text-sm border transition ' +
              (active === tItem.key
                ? 'bg-white text-black border-transparent shadow'
                : 'border-white/20 text-white/70 hover:border-white/40')
            }
          >
            {tItem.label} ({tItem.items?.length || 0})
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.length ? items.map(renderItem) : <div className="text-white/60 text-sm">Nothing here.</div>}
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

