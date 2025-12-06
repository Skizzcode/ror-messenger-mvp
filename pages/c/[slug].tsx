// pages/c/[slug].tsx
import useSWR from 'swr';
import Link from 'next/link';
import { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { signCreateThread, signMessagePayload, signBindFan } from '../../lib/sign';
import { clientInitEscrow } from '../../lib/escrowClient';
import { t } from '../../lib/telemetry';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// How many fan messages are allowed before the creator replies the first time:
const FAN_PRE_REPLY_LIMIT = 2;

export default function ChatPage({ handle }: { handle: string }) {
  // UI state
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [forceRole, setForceRole] = useState<'fan' | null>(null); // creator can test as fan
  const [ref, setRef] = useState<string | null>(null);
  const [showLimitHint, setShowLimitHint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [noir, setNoir] = useState(false);
  const [payVariant, setPayVariant] = useState<'standard' | 'fast'>('standard');
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [tipAmount, setTipAmount] = useState<number>(5);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // slug used when creating a new thread (chat launched via /c/{creatorHandle})
  const creatorHandle = handle;

  // mount + read ?ref=
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('ref');
      if (r) setRef(r);
      const d = u.searchParams.get('discount');
      if (d && !Number.isNaN(Number(d))) setDiscountPercent(Number(d));
      const off = u.searchParams.get('offer');
      if (off) setSelectedOfferId(off);
    }
  }, []);

  // Load thread + messages (poll)
  const { data, mutate } = useSWR(
    () => (mounted ? `/api/thread?id=${handle}` : null),
    fetcher,
    { refreshInterval: 1500 }
  );
  const thread = data?.thread;
  const messages = data?.messages || [];
  const creatorProfile = data?.creatorProfile || null;

  // Simple page view telemetry (thread vs handle)
  useEffect(() => {
    if (!mounted) return;
    t('page_view', {
      scope: 'chat',
      props: {
        kind: thread ? 'existing_thread' : 'creator_handle',
        slug: handle,
      },
    });
  }, [mounted, thread, handle]);

  // Wallet state
  const wallet = useWallet();
  const isConnected = !!wallet.publicKey;
  const walletPk = wallet.publicKey?.toBase58() || null;

  // Live ticking countdown for SLA
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Role: auto-detect
  const autoRole: 'fan' | 'creator' = useMemo(() => {
    if (!thread) return 'fan';
    if (walletPk && thread.creator_pubkey && walletPk === thread.creator_pubkey) return 'creator';
    return 'fan';
  }, [thread, walletPk]);

  // Only the creator's wallet may test as fan (and only if it's not also the fan wallet)
  const canActAsFan =
    walletPk &&
    thread?.creator_pubkey &&
    walletPk === thread.creator_pubkey &&
    walletPk !== thread.fan_pubkey;

  // Final role applied in UI
  const role: 'fan' | 'creator' = forceRole ?? autoRole;

  // ======== Fan pre-reply counter (UI only) ========
  const fanPreCount = useMemo(() => {
    const firstCreatorIndex = (messages || []).findIndex((m: any) => m.from === 'creator');
    const slice = firstCreatorIndex === -1 ? messages : messages.slice(0, firstCreatorIndex);
    return (slice || []).filter((m: any) => m.from === 'fan').length;
  }, [messages]);

  const creatorHasReplied = useMemo(
    () => (messages || []).some((m: any) => m.from === 'creator'),
    [messages]
  );

  const fanRemaining = Math.max(0, FAN_PRE_REPLY_LIMIT - fanPreCount);
  const fanLimitReached = role === 'fan' && !creatorHasReplied && fanRemaining <= 0;

  const canSend = isConnected && text.trim().length > 0 && !sending && !fanLimitReached && !!thread;

  // Auto-scroll to bottom
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, mounted]);

  // Escrow (client stub) - only for fan role when a thread exists
  const escrowTried = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const canSignTx = (wallet as any)?.signTransaction;
    if (thread && role === 'fan' && wallet.publicKey && canSignTx && !escrowTried.current) {
      escrowTried.current = true;
      clientInitEscrow({
        threadId: thread.id,
        amountUSDC: thread.amount || 20,
        payer: wallet.publicKey,
        wallet: wallet as any,
      })
        .then((r) => {
          setLastTx(r.tx);
          t('escrow_init', { scope: 'chat', props: { threadId: thread.id, ok: true } });
        })
        .catch((e: any) => {
          console.error(e);
          t('escrow_init', { scope: 'chat', props: { threadId: thread.id, ok: false, err: String(e?.message || e) } });
        });
    }
  }, [thread, role, wallet.publicKey, mounted]);

  // Countdown
  const countdown = useMemo(() => {
    if (!thread || !thread.deadline) return null;
    const ms = Math.max(0, thread.deadline - nowMs);
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return { text: `${h}:${m}:${s}`, ms };
  }, [thread, nowMs]);

  const offers = creatorProfile?.offers || [];
  const standardPrice = creatorProfile?.price ?? 20;
  const standardWindow = creatorProfile?.replyWindowHours ?? 48;
  const fastPrice = creatorProfile?.fastPrice ?? Math.round(standardPrice * 1.5 * 100) / 100;
  const fastWindow = creatorProfile?.fastReplyWindowHours ?? Math.max(12, Math.round(standardWindow / 2));
  const selectedOffer = offers.find((o: any) => o.id === selectedOfferId) || null;
  const discountActive = discountPercent !== null && !Number.isNaN(discountPercent);
  const hasStripeConnect = !!creatorProfile?.stripeAccountId;

  const shell = 'bg-gradient-to-br from-[#05070f] via-[#0d1327] to-[#05070f] text-white';
  const panel = 'bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_30px_120px_rgba(0,0,0,0.45)]';
  const pill = 'px-3 py-1 rounded-full text-[11px] border shadow-sm transition-transform hover:-translate-y-[1px]';
  const pillStatus = !thread
    ? 'bg-sky-400/20 border-sky-300/35 text-sky-50'
    : thread.status === 'answered'
    ? 'bg-emerald-400/20 border-emerald-300/40 text-emerald-50'
    : thread.status === 'refunded'
    ? 'bg-rose-400/20 border-rose-300/35 text-rose-50'
    : 'bg-amber-400/20 border-amber-300/35 text-amber-50';
  const pillTime = 'bg-cyan-400/15 border-cyan-300/30 text-cyan-50';
  const pillNeutral = 'bg-white/10 border-white/20 text-white/85';
  const pillAccent = 'bg-indigo-400/20 border-indigo-300/35 text-indigo-50';

  // Send message or create thread
  async function send() {
    if (!text.trim() || sending) return;
    if (!isConnected) {
      alert('Connect your wallet first.');
      return;
    }
    const canSign = (wallet as any)?.signMessage;
    if (!canSign) {
      alert('Your wallet must support message signing.');
      return;
    }

    setSending(true);
    try {
      if (!thread) {
        setToast('Start with card checkout to open this chat.');
        setTimeout(() => setToast(null), 1800);
        return;
      }

      if (fanLimitReached && role === 'fan' && !creatorHasReplied) {
        alert(
          `You have reached the pre-reply limit (${FAN_PRE_REPLY_LIMIT}/${FAN_PRE_REPLY_LIMIT}). Please wait for the creator to reply.`
        );
        setSending(false);
        return;
      }

      const signed = await signMessagePayload(wallet as any, {
        threadId: thread.id,
        from: role,
        body: text,
      });

      const r = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          from: role,
          body: text,
          sigBase58: signed.sigBase58,
          msg: signed.msg,
          pubkeyBase58: signed.pubkeyBase58,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        t('send_message_failed', {
          scope: 'chat',
          props: { threadId: thread.id, role, error: j?.error || 'unknown' },
        });
        throw new Error(j?.error || 'Failed to send');
      }

      t('send_message', { scope: 'chat', props: { threadId: thread.id, role } });
      setText('');
      setToast('Sent. Creator is notified.');
      setTimeout(() => setToast(null), 1800);
      mutate();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Error');
    } finally {
      setSending(false);
    }
  }

  const statusLabel = !thread
    ? 'Awaiting checkout'
    : thread.status === 'answered'
    ? 'Answered - escrow released'
    : thread.status === 'refunded'
    ? 'Refunded'
    : 'Open - escrowed';

  return (
    <div className={`min-h-screen relative overflow-hidden ${shell}`}>
      <div className="pointer-events-none absolute -top-20 -right-12 h-80 w-80 bg-emerald-400/25 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute top-12 -left-12 h-64 w-64 bg-cyan-400/20 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_18%_22%,#ffffff,transparent_26%),radial-gradient(circle_at_82%_0%,#7cffe0,transparent_20%)]" />

      {/* GLOBAL HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#05070f]/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-12 w-12 rounded-3xl object-contain shadow-lg"
            />
            <div>
              <div className="font-bold tracking-tight group-hover:opacity-80 transition">Reply or Refund</div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Paid DMs</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-9 !px-3 !py-0 !text-sm !shadow" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6 relative z-10">
        {/* HERO */}
        <div className={`${panel} rounded-3xl p-6 lg:p-7 relative overflow-hidden`}>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-400/10 via-transparent to-cyan-400/15" />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={creatorProfile?.avatarDataUrl || '/logo-ror-glass.svg'}
                  alt="Creator avatar"
                  className="h-14 w-14 rounded-2xl object-cover border border-white/10"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-black leading-tight">{creatorProfile?.displayName || `@${creatorHandle}`}</div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${thread?.creator_pubkey ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-50' : 'border-white/15 bg-white/10 text-white/80'}`}>
                      @{creatorHandle}
                    </span>
                  </div>
                  <div className="text-sm text-white/80">
                    Guaranteed reply in {standardWindow}h or auto-refund. Escrow holds funds until creator replies.
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em]">
                    <span className={`${pill} ${pillStatus}`}>{statusLabel}</span>
                    {countdown && thread && (
                      <span className={`${pill} ${pillTime}`}>
                        {thread.status === 'answered' ? 'Escrow released' : `Time left ${countdown.text}`}
                      </span>
                    )}
                    <span className={`${pill} ${pillAccent}`}>{standardWindow}h SLA</span>
                    {discountActive && (
                      <span className={`${pill} bg-emerald-400/20 border-emerald-300/40 text-emerald-50`}>
                        Launch promo: {discountPercent}% off
                      </span>
                    )}
                    {mounted && lastTx && (
                      <span className={`${pill} ${pillNeutral}`}>Escrow {lastTx.slice(0, 8)}...</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 text-right min-w-[180px]">
                <div className="text-xs text-white/60">Current view</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className="px-3 py-1 rounded-full text-[11px] border border-white/15 bg-white/5">
                    {role === 'creator' ? 'Creator' : 'Fan'} mode
                  </span>
                  {canActAsFan && (
                    <button
                      onClick={() => {
                        setForceRole((r) => (r ? null : 'fan'));
                        t('switch_role_test_as_fan', { scope: 'chat', props: { threadId: thread?.id || null } });
                      }}
                      className="px-3 py-1 rounded-full text-[11px] border border-white/20 bg-white/10 hover:bg-white/15 transition"
                    >
                      {forceRole === 'fan' ? 'Back to creator' : 'Test as fan'}
                    </button>
                  )}
                  <button
                    onClick={() => setNoir((v) => !v)}
                    className="px-3 py-1 rounded-full text-[11px] border border-white/20 bg-white/10 hover:bg-white/15 transition"
                  >
                    {noir ? 'Color on' : 'Focus (noir)'}
                  </button>
                </div>
                <div className="text-xs text-white/60">
                  Standard €{standardPrice.toFixed(2)} · Fast €{fastPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* LEFT: conversation */}
          <section className="lg:col-span-2 space-y-5">
            <div className={`${panel} rounded-3xl overflow-hidden`}>
              <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
                <div className="flex items-center gap-2 flex-wrap text-[12px] text-white/80">
                  <span className={`${pill} ${pillStatus}`}>{statusLabel}</span>
                  {countdown && thread && (
                    <span className={`${pill} ${pillTime}`}>
                      {thread.status === 'answered' ? 'Escrow released' : `Time left ${countdown.text}`}
                    </span>
                  )}
                  {role === 'fan' && !creatorHasReplied && (
                    <span className={`${pill} bg-indigo-400/20 border-indigo-300/35 text-indigo-50`}>
                      Pre-reply cap {fanPreCount}/{FAN_PRE_REPLY_LIMIT}
                    </span>
                  )}
                  {discountActive && (
                    <span className={`${pill} bg-emerald-400/20 border-emerald-300/40 text-emerald-50`}>
                      Launch promo: {discountPercent}% off
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-white/60 flex items-center gap-2">
                  <span>Escrow releases on creator reply</span>
                  <div className="h-1 w-1 rounded-full bg-white/30" />
                  <span>Auto-refund on miss</span>
                </div>
              </div>

              {/* Bind (Stripe fan with no wallet binding yet) */}
              {mounted && thread?.paid_via === 'stripe' && !thread?.fan_pubkey && role === 'fan' && (
                <div className="px-5 py-4 border-b border-white/10 bg-amber-400/10 text-amber-100 flex items-center justify-between gap-3">
                  <div className="text-sm">Bind this chat to your wallet to keep messaging.</div>
                  <button
                    className="bg-white text-black text-xs px-3 py-1 rounded-xl"
                    onClick={async () => {
                      if (!wallet.publicKey) {
                        alert('Connect wallet first');
                        return;
                      }
                      try {
                        const signed = await signBindFan(wallet as any, { threadId: thread.id });
                        const r = await fetch('/api/thread/bind-fan', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            threadId: thread.id,
                            ...signed,
                          }),
                        });
                        const j = await r.json();
                        if (!r.ok) {
                          t('bind_fan_failed', { scope: 'chat', props: { threadId: thread.id, error: j?.error || 'unknown' } });
                          throw new Error(j?.error || 'Bind failed');
                        }
                        t('bind_fan_success', { scope: 'chat', props: { threadId: thread.id } });
                        mutate();
                      } catch (e: any) {
                        alert(e?.message || 'Error');
                      }
                    }}
                  >
                    Bind now
                  </button>
                </div>
              )}

              <div
                ref={listRef}
                className="flex-1 max-h-[60vh] overflow-y-auto space-y-3 px-5 py-5 scrollbar-thin scrollbar-thumb-white/10"
                style={{ filter: noir ? 'grayscale(1) contrast(1.05)' : 'none', transition: 'filter 200ms ease' }}
              >
                {messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={
                      'max-w-[78%] px-4 py-3 rounded-2xl shadow-sm relative ' +
                      (m.from === 'fan'
                        ? 'bg-white text-black rounded-bl-md'
                        : 'bg-[#0f172a]/90 border border-white/10 rounded-br-md ml-auto text-white')
                    }
                  >
                    <div className="text-[10px] uppercase tracking-wide opacity-50 mb-1">
                      {m.from === 'fan' ? 'Fan' : 'Creator'}
                    </div>
                    <div className="text-sm leading-relaxed pr-8 break-words whitespace-pre-wrap">{m.body}</div>
                    <div className="absolute bottom-2 right-3 text-[10px] flex items-center gap-1 opacity-60">
                      <span>{formatMsgStatus(m, thread)}</span>
                    </div>
                  </div>
                ))}
                {!messages.length && (
                  <div className="text-sm text-white/35 text-center py-8">
                    No messages yet — send your opener after checkout.
                  </div>
                )}
              </div>

              {role === 'fan' && !creatorHasReplied && (
                <div className="px-5 pb-1 text-[11px] text-white/55">
                  You can send <b>{FAN_PRE_REPLY_LIMIT}</b> messages before the creator replies. Remaining: <b>{fanRemaining}/{FAN_PRE_REPLY_LIMIT}</b>.
                </div>
              )}

            {thread && thread.status === 'answered' && (
              <div className="px-5 pb-4 pt-2 border-t border-white/10 grid gap-3 md:grid-cols-2">
                  <button
                    className="px-4 py-3 rounded-2xl border border-white/15 bg-white/10 text-sm text-left hover:bg-white/15 transition"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const next = `/c/${creatorHandle}?discount=20`;
                        window.location.href = next;
                      }
                    }}
                  >
                    <div className="font-semibold">Start follow-up (-20%)</div>
                    <div className="text-xs text-white/70">Return with a discount and keep the thread warm (return customer special).</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={tipAmount}
                      onChange={(e) => setTipAmount(Number(e.target.value) || 1)}
                      placeholder="Tip amount"
                    />
                    <button
                      className="px-4 py-3 rounded-2xl bg-white text-black text-sm hover:shadow"
                      onClick={async () => {
                        try {
                          const r = await fetch('/api/checkout/tip', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ threadId: thread.id, creator: creatorHandle, amount: tipAmount }),
                          });
                          const j = await r.json();
                          if (j?.url) {
                            setToast('Redirecting to tip checkout...');
                            setTimeout(() => setToast(null), 1500);
                            window.location.href = j.url;
                          }
                        } catch (e) {
                          setToast('Tip failed. Try again.');
                          setTimeout(() => setToast(null), 2000);
                        }
                      }}
                    >
                      Tip creator
                    </button>
                  </div>
                </div>
              )}

              {/* INPUT */}
              <div className="px-5 py-4 border-t border-white/10 space-y-3">
                {role === 'fan' && !thread && (
                  <div className="text-xs text-white/70 flex flex-wrap items-center gap-2">
                    <span className={pill}>Standard €{standardPrice.toFixed(2)} · {standardWindow}h</span>
                    <span className={pill}>Fast €{fastPrice.toFixed(2)} · {fastWindow}h</span>
                    {offers.map((o: any) => (
                      <span key={o.id} className={pill}>
                        {o.title}: €{Number(o.price).toFixed(2)} · {o.replyWindowHours || standardWindow}h
                      </span>
                    ))}
                  </div>
                )}
                {!hasStripeConnect && !thread && (
                  <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-300/30 px-3 py-2 rounded-xl">
                    Card checkout is disabled for this creator (Stripe not connected). Use wallet flow only.
                  </div>
                )}

                <textarea
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-40"
                  placeholder={role === 'creator' ? 'Write your reply...' : thread ? 'Write your message...' : 'Type your message, then pay to send'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    const isMobile =
                      typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
                    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                      e.preventDefault();
                      if (canSend) send();
                    }
                  }}
                  disabled={(!!thread && !isConnected) || fanLimitReached}
                  title={
                    fanLimitReached
                      ? 'Pre-reply limit reached. Please wait for the creator to respond.'
                      : undefined
                  }
                  onFocus={() => setShowLimitHint(false)}
                />
                <div className="flex items-center gap-2 justify-between">
                  <button
                    onClick={send}
                    className="bg-gradient-to-r from-emerald-300 via-cyan-200 to-blue-200 text-[#0b1424] text-sm px-5 py-2 rounded-2xl disabled:opacity-40 shadow-lg hover:shadow-xl hover:-translate-y-[1px] transition"
                    disabled={!canSend}
                    title={!canSend && fanLimitReached ? 'Pre-reply limit reached.' : undefined}
                    onMouseEnter={() => { if (fanLimitReached) setShowLimitHint(true); }}
                    onMouseLeave={() => setShowLimitHint(false)}
                  >
                    {sending
                      ? 'Sending...'
                      : role === 'creator'
                      ? 'Send reply'
                      : !thread
                      ? 'Locked until paid'
                      : fanLimitReached && !creatorHasReplied
                      ? 'Limit reached'
                      : 'Send'}
                  </button>
                  <span className="text-[11px] text-white/40">
                    {role === 'creator'
                      ? 'First substantial reply releases escrow.'
                      : 'Enter = send (desktop)'}
                  </span>
                </div>

                {fanLimitReached && !creatorHasReplied && showLimitHint && (
                  <div className="text-[11px] text-white/60">
                    You can send at most {FAN_PRE_REPLY_LIMIT} messages before the creator's first reply.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT: actions */}
          <aside className="space-y-5">
            <div className={`${panel} rounded-3xl p-5 space-y-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Start or restart chat</div>
                  <p className="text-xs text-white/60">Card checkout opens escrow. Creator replies within SLA or you get auto-refund.</p>
                </div>
                <div className="text-[11px] px-3 py-1 rounded-full border border-white/15 bg-white/10">High trust</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPayVariant('standard')}
                  className={
                    'px-4 py-2 rounded-2xl text-sm border ' +
                    (payVariant === 'standard' ? 'bg-white text-black' : 'border-white/30')
                  }
                  disabled={!hasStripeConnect}
                >
                  Standard · €{standardPrice.toFixed(2)}
                </button>
                <button
                  onClick={() => setPayVariant('fast')}
                  className={
                    'px-4 py-2 rounded-2xl text-sm border ' +
                    (payVariant === 'fast' ? 'bg-white text-black' : 'border-white/30')
                  }
                  disabled={!hasStripeConnect}
                >
                  Fast · €{fastPrice.toFixed(2)}
                </button>
                {offers.map((o: any) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelectedOfferId(o.id);
                      setPayVariant('standard');
                    }}
                    className={
                      'px-4 py-2 rounded-2xl text-sm border ' +
                      (selectedOfferId === o.id ? 'bg-white text-black' : 'border-white/30')
                    }
                    disabled={!hasStripeConnect}
                  >
                    {o.title || 'Custom'} · €{Number(o.price || 0).toFixed(2)}
                  </button>
                ))}
              </div>

              <div className="text-xs text-white/65 flex flex-col gap-1">
                <span>Standard: {standardWindow}h reply window</span>
                <span>Fast: {fastWindow}h reply window</span>
                {selectedOffer && (
                  <span>Selected offer window: {selectedOffer.replyWindowHours || standardWindow}h</span>
                )}
              </div>

              <button
                onClick={async () => {
                  if (!text.trim()) {
                    alert('Type your first message first.');
                    return;
                  }
                  if (!hasStripeConnect) {
                    alert('Card checkout is not available for this creator.');
                    return;
                  }
                  try {
                    t('pay_with_card_click', { scope: 'chat', props: { creator: creatorHandle, variant: payVariant } });
                    const r = await fetch('/api/checkout/create', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        creator: creatorHandle,
                        amount: selectedOffer ? selectedOffer.price : payVariant === 'fast' ? fastPrice : standardPrice,
                        ttlHours: selectedOffer ? selectedOffer.replyWindowHours || standardWindow : payVariant === 'fast' ? fastWindow : standardWindow,
                        firstMessage: text,
                        variant: selectedOffer ? `offer:${selectedOffer.id}` : payVariant,
                        ...(selectedOffer ? { offerId: selectedOffer.id, offerTitle: selectedOffer.title || '' } : {}),
                        ...(discountPercent ? { discountPercent } : {}),
                        ...(ref ? { ref } : {}),
                      }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) {
                      const msg =
                        j?.error === 'STRIPE_CONNECT_ONBOARDING_REQUIRED'
                          ? 'Creator must finish Stripe onboarding before card checkouts.'
                          : j?.error || 'Checkout unavailable. Try again later.';
                      setToast(msg);
                      setTimeout(() => setToast(null), 2600);
                      return;
                    }
                    if (j?.url) {
                      setToast('Redirecting to secure checkout...');
                      setTimeout(() => setToast(null), 1500);
                      window.location.href = j.url;
                    } else {
                      setToast('Checkout link missing. Try again.');
                      setTimeout(() => setToast(null), 1800);
                    }
                  } catch (e) {
                    console.error(e);
                    setToast('Checkout failed. Try again.');
                    setTimeout(() => setToast(null), 2000);
                  }
                }}
                className="w-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-blue-200 text-[#0b1424] text-sm px-4 py-3 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-[1px] transition disabled:opacity-50"
                disabled={!hasStripeConnect}
              >
                Pay with card to start
                <div className="text-[11px] text-black/70">
                  Secure checkout · Escrowed until reply · Auto-refund on SLA miss
                  {discountActive && ` · Launch promo ${discountPercent}% off`}
                </div>
              </button>
              <div className="text-[11px] text-white/55">
                Your first message is sent after checkout. Escrow releases when the creator replies within SLA.
              </div>
              {!hasStripeConnect && (
                <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-300/30 px-3 py-2 rounded-xl">
                  Card checkout disabled until this creator connects Stripe. Use wallet flow instead.
                </div>
              )}
            </div>

            <div className={`${panel} rounded-3xl p-5 space-y-3`}>
              <div className="text-sm font-semibold">Thread facts</div>
              <div className="text-xs text-white/70 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className={`px-2 py-1 rounded-full text-[11px] ${pill} ${pillStatus}`}>{statusLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Payment</span>
                  <span className="text-white/80">{thread?.paid_via ? thread.paid_via : 'Card on start'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Messages</span>
                  <span className="text-white/80">{messages.length}</span>
                </div>
                {thread?.fan_pubkey && (
                  <div className="flex items-center justify-between">
                    <span>Fan wallet</span>
                    <span className="text-white/80">{thread.fan_pubkey.slice(0, 6)}...</span>
                  </div>
                )}
                {thread?.creator_pubkey && (
                  <div className="flex items-center justify-between">
                    <span>Creator wallet</span>
                    <span className="text-white/80">{thread.creator_pubkey.slice(0, 6)}...</span>
                  </div>
                )}
              </div>
            </div>

            <div className={`${panel} rounded-3xl p-5 space-y-2`}>
              <div className="text-sm font-semibold">Safety & refund</div>
              <div className="text-xs text-white/65 space-y-2">
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Escrow auto-refunds if SLA is missed.</div>
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Creator must reply with a substantial message.</div>
                <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Wallet-signed messages bind sender identity.</div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-xl bg-white text-black text-sm shadow-lg border border-black/5">
          {toast}
        </div>
      )}
    </div>
  );
}

function formatMs(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMsgStatus(m: any, thread: any) {
  if (!thread) return 'pending';
  if (thread.status === 'refunded') return 'refunded';
  if (thread.status === 'answered') return 'delivered';
  if (thread.status === 'open') return 'escrowed';
  return 'sent';
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.slug } };
}

