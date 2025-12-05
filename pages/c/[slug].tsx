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
  const [forceRole, setForceRole] = useState<'fan' | null>(null); // creator can “test as fan”
  const [ref, setRef] = useState<string | null>(null);
  const [showLimitHint, setShowLimitHint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [noir, setNoir] = useState(false);
  const [payVariant, setPayVariant] = useState<'standard' | 'fast'>('standard');
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [tipAmount, setTipAmount] = useState<number>(5);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

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

  // Role: auto-detect
  const autoRole: 'fan' | 'creator' = useMemo(() => {
    if (!thread) return 'fan';
    if (walletPk && thread.creator_pubkey && walletPk === thread.creator_pubkey) return 'creator';
    return 'fan';
  }, [thread, walletPk]);

  // Only the creator’s wallet may “test as fan” (and only if it’s not also the fan wallet)
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

  // Escrow (client stub) — only for fan role when a thread exists
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
  const timeLeft = useMemo(() => {
    if (!mounted || !thread) return null;
    const ms = Math.max(0, thread.deadline - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [thread, mounted, data]);

  const offers = creatorProfile?.offers || [];
  const standardPrice = creatorProfile?.price ?? 20;
  const standardWindow = creatorProfile?.replyWindowHours ?? 48;
  const fastPrice = creatorProfile?.fastPrice ?? Math.round(standardPrice * 1.5 * 100) / 100;
  const fastWindow = creatorProfile?.fastReplyWindowHours ?? Math.max(12, Math.round(standardWindow / 2));
  const selectedOffer = offers.find((o: any) => o.id === selectedOfferId) || null;

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
      // No thread yet → require card checkout to start
      if (!thread) {
        setToast('Start with card checkout to open this chat.');
        setTimeout(() => setToast(null), 1800);
        return;
      }

      // Thread exists → normal message flow
      if (fanLimitReached && role === 'fan' && !creatorHasReplied) {
        alert(
          `You’ve reached the pre-reply limit (${FAN_PRE_REPLY_LIMIT}/${FAN_PRE_REPLY_LIMIT}). Please wait for the creator’s reply.`
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

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-12 w-12 rounded-2xl  shadow-sm"
            />
            <span className="font-semibold tracking-tight group-hover:opacity-80 transition">
              Reply or Refund
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <WalletMultiButtonDynamic className="!bg-white !text-black !rounded-2xl !h-8 !px-3 !py-0 !text-sm !shadow" />
          </div>
        </div>
      </header>

      {/* CHAT HEADER */}
      <header className="z-20 bg-black/10 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={creatorProfile?.avatarDataUrl || '/logo-ror-glass.svg'}
              alt="RoR"
              className="h-8 w-8 rounded-full  shadow-sm object-cover"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                {thread ? 'RoR Chat' : `Chat with ${creatorHandle}`}
              </div>
              <div className="text-[10px] text-white/40">
                {thread ? `Time left: ${timeLeft || '—'}` : 'New conversation'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {thread?.creator_pubkey && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-50">
                Verified creator
              </span>
            )}
            {creatorProfile?.answerRate !== null && creatorProfile?.answerRate !== undefined && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 ">
                Answers {(creatorProfile.answerRate * 100).toFixed(0)}%
              </span>
            )}
            {creatorProfile?.avgReplyMs ? (
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 ">
                Avg reply {formatMs(creatorProfile.avgReplyMs)}
              </span>
            ) : null}
            {role === 'fan' && !creatorHasReplied && (
              <span
                className="text-[10px] px-2 py-1 rounded-xl bg-white/5 "
                title={`Before the creator's first reply you can send up to ${FAN_PRE_REPLY_LIMIT} messages.`}
              >
                Pre-reply cap: {fanPreCount}/{FAN_PRE_REPLY_LIMIT}
              </span>
            )}
            {canActAsFan && (
              <button
                onClick={() => {
                  setForceRole((r) => (r ? null : 'fan'));
                  t('switch_role_test_as_fan', { scope: 'chat', props: { threadId: thread?.id || null } });
                }}
                className="text-[10px] px-2 py-1 rounded-xl bg-white/5  hover:bg-white/10 transition"
              >
                {forceRole === 'fan' ? 'Back to creator' : 'Test as fan'}
              </button>
            )}
            {mounted && lastTx && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-50">
                escrow: {lastTx.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-3">
        <div
          className="rounded-3xl bg-white/[0.03] border border-white/[0.04] backdrop-blur-xl flex flex-col gap-3 p-4 min-h-[60vh] shadow-[0_12px_60px_rgba(0,0,0,0.25)]"
          style={{ filter: noir ? 'grayscale(1) contrast(1.05)' : 'none', transition: 'filter 200ms ease' }}
        >
          {/* Bind (Stripe fan with no wallet binding yet) */}
          {mounted && thread?.paid_via === 'stripe' && !thread?.fan_pubkey && role === 'fan' && (
            <div className="p-3 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 text-sm flex items-center justify-between gap-3">
              <span className="text-xs md:text-sm">
                Bind this chat to your wallet.
              </span>
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

          {/* STATUS STRIP */}
          <div className="flex items-center justify-between text-[11px] text-white/60">
            {!thread ? (
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">✓ waiting for payment</span>
                <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Send unlocks after checkout</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/40 text-emerald-50">✓✓ paid & escrowed</span>
                {timeLeft && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Time left: {timeLeft}</span>}
              </div>
            )}
            <button
              className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px]"
              onClick={() => setNoir((v) => !v)}
            >
              {noir ? 'Show color' : 'Noir view'}
            </button>
          </div>

          {/* MESSAGES */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10"
            style={{ filter: noir ? 'grayscale(1) contrast(1.05)' : 'none', transition: 'filter 200ms ease' }}
          >
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={
                  'max-w-[78%] px-4 py-2 rounded-2xl shadow-sm relative ' +
                  (m.from === 'fan'
                    ? 'bg-white text-black rounded-bl-md'
                    : 'bg-[#111827]/90 border border-white/5 rounded-br-md ml-auto')
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-40 mb-1">
                  {m.from === 'fan' ? 'Fan' : 'Creator'}
                </div>
                <div className="text-sm leading-relaxed pr-8">{m.body}</div>
                <div className="absolute bottom-2 right-3 text-[10px] flex items-center gap-1 opacity-60">
                  <span>{formatMsgStatus(m, thread)}</span>
                </div>
              </div>
            ))}
            {!messages.length && (
              <div className="text-sm text-white/25 text-center py-6">
                No messages yet — start the conversation.
              </div>
            )}
          </div>

          {/* LIMIT HINT (Fan before first creator reply) */}
          {role === 'fan' && !creatorHasReplied && (
            <div className="text-[11px] text-white/45">
              You can send <b>{FAN_PRE_REPLY_LIMIT}</b> messages before the creator replies. Remaining:{' '}
              <b>{fanRemaining}/{FAN_PRE_REPLY_LIMIT}</b>.
            </div>
          )}

          {/* Follow-up & Tip CTAs */}
          {thread && thread.status === 'answered' && (
            <div className="grid gap-2 md:grid-cols-2">
              <button
                className="px-4 py-2 rounded-2xl border border-white/15 bg-white/5 text-sm"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const next = `/c/${creatorHandle}?discount=20`;
                    window.location.href = next;
                  }
                }}
              >
                Start follow-up (-20%)
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
                  className="px-3 py-2 rounded-2xl bg-white text-black text-sm"
                  onClick={async () => {
                    try {
                      const r = await fetch('/api/checkout/tip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ threadId: thread.id, creator: creatorHandle, amount: tipAmount }),
                      });
                      const j = await r.json();
                      if (j?.url) {
                        setToast('Redirecting to tip checkout…');
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
          <div className="space-y-2">
            {/* Pay with card – always available to start a new chat */}
            {role === 'fan' && !thread && (
              <div className="space-y-2">
                <div className="flex gap-2 text-xs text-white/60 items-center flex-wrap">
                  <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Standard: €{standardPrice.toFixed(2)} · {standardWindow}h</span>
                  <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Fast: €{fastPrice.toFixed(2)} · {fastWindow}h</span>
                  {offers.map((o: any) => (
                    <span key={o.id} className="px-2 py-1 rounded-full bg-white/5 border border-white/10">
                      {o.title}: €{Number(o.price).toFixed(2)} · {o.replyWindowHours || standardWindow}h
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setPayVariant('standard')}
                    className={
                      'px-4 py-2 rounded-2xl text-sm border ' +
                      (payVariant === 'standard' ? 'bg-white text-black' : 'border-white/20')
                    }
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => setPayVariant('fast')}
                    className={
                      'px-4 py-2 rounded-2xl text-sm border ' +
                      (payVariant === 'fast' ? 'bg-white text-black' : 'border-white/20')
                    }
                  >
                    Fast reply
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
                        (selectedOfferId === o.id ? 'bg-white text-black' : 'border-white/20')
                      }
                    >
                      {o.title || 'Custom'}
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      if (!text.trim()) {
                        alert('Type your first message first.');
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
                        const j = await r.json();
                        if (j?.url) {
                          setToast('Redirecting to secure checkout…');
                          setTimeout(() => setToast(null), 1500);
                          window.location.href = j.url;
                        } else {
                          setToast('Redirecting to secure checkout…');
                          setTimeout(() => setToast(null), 1500);
                        }
                      } catch (e) {
                        console.error(e);
                        setToast('Checkout failed. Try again.');
                        setTimeout(() => setToast(null), 2000);
                      }
                    }}
                    className="bg-white text-black text-sm px-4 py-2 rounded-2xl shadow-sm"
                  >
                    Pay with card to start
                  </button>
                </div>
              </div>
            )}

            <textarea
              className="w-full bg-black/30 border border-white/5 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/15 disabled:opacity-40"
              placeholder={role === 'creator' ? 'Write your reply…' : thread ? 'Write your message…' : 'Type your message, then pay to send'}
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
                className="bg-white text-black text-sm px-5 py-2 rounded-2xl disabled:opacity-40 shadow-sm"
                disabled={!canSend}
                title={!canSend && fanLimitReached ? 'Pre-reply limit reached.' : undefined}
                onMouseEnter={() => { if (fanLimitReached) setShowLimitHint(true); }}
                onMouseLeave={() => setShowLimitHint(false)}
              >
                {sending
                  ? 'Sending…'
                  : role === 'creator'
                  ? 'Send reply'
                  : !thread
                  ? 'Locked until paid'
                  : fanLimitReached && !creatorHasReplied
                  ? 'Limit reached'
                  : 'Send & lock'}
              </button>
              <span className="text-[11px] text-white/35">
                {role === 'creator'
                  ? 'First substantial reply releases escrow.'
                  : 'Enter = send (desktop)'}
              </span>
            </div>

            {fanLimitReached && !creatorHasReplied && showLimitHint && (
              <div className="text-[11px] text-white/60">
                You can send at most {FAN_PRE_REPLY_LIMIT} messages before the creator’s first reply.
              </div>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-4 right-4 px-4 py-2 rounded-xl bg-white text-black text-sm shadow-lg border border-black/5">
            {toast}
          </div>
        )}
      </main>
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
  if (!thread) return '✓ pending';
  if (thread.status === 'refunded') return '✓ refunded';
  if (thread.status === 'answered') return '✓✓ delivered';
  if (thread.status === 'open') return '✓✓ escrowed';
  return '✓ sent';
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.slug } };
}
