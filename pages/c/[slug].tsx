// pages/c/[slug].tsx
import useSWR from 'swr';
import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { clientInitEscrow } from '../../lib/escrowClient';
import { signCreateThread, signMessagePayload, signBindFan } from '../../lib/sign';

// Wallet button must render client-side only (avoid hydration mismatch)
const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function Chat({ handle }: { handle: string }) {
  const [role, setRole] = useState<'fan' | 'creator'>('fan');
  const [text, setText] = useState('');
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => setMounted(true), []);

  // Load thread/messages only on client
  const { data, mutate } = useSWR(() => (mounted ? `/api/thread?id=${handle}` : null), fetcher, {
    refreshInterval: 1500
  });

  const thread = data?.thread;
  const messages = data?.messages || [];

  // Wallet
  const wallet = useWallet();
  const isConnected = !!wallet.publicKey;
  const canSend = isConnected && text.trim().length > 0 && !sending;

  // Auto-scroll to bottom on new messages
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, mounted]);

  // One-time escrow init (fan + wallet + thread)
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
        .then(r => setLastTx(r.tx))
        .catch(console.error);
    }
  }, [thread, role, wallet.publicKey, mounted]); // canSignTx intentionally not in deps

  // Countdown (only after mounted to avoid SSR/CSR mismatch)
  const timeLeft = useMemo(() => {
    if (!mounted || !thread) return null;
    const ms = Math.max(0, thread.deadline - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [thread, mounted, data]);

  // Send message (create thread or post message) with signature
  async function send() {
    if (!text.trim() || sending) return;
    if (!isConnected) {
      alert('Please connect your wallet to send messages.');
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
        // Sign start payload
        const signed = await signCreateThread(wallet as any, {
          creator: 'creator-demo', // TODO: replace with real creator handle/id
          fanPubkey: wallet.publicKey!.toBase58(),
          firstMessage: text,
          ttlHours: 48
        });

        const r = await fetch('/api/create-thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creator: 'creator-demo',
            fan: 'fan-demo',
            amount: 20,
            ttlHours: 48,
            firstMessage: text,
            fanPubkey: wallet.publicKey!.toBase58(),
            creatorPubkey: null,
            // signature fields
            sigBase58: signed.sigBase58,
            msg: signed.msg,
            pubkeyBase58: signed.pubkeyBase58
          })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Failed to create thread');
        if (typeof window !== 'undefined') window.location.href = `/c/${j.threadId}`;
        return;
      }

      // Sign message payload
      const signed = await signMessagePayload(wallet as any, {
        threadId: thread.id,
        from: role,
        body: text
      });

      const r = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          from: role,
          body: text,
          // signature fields
          sigBase58: signed.sigBase58,
          msg: signed.msg,
          pubkeyBase58: signed.pubkeyBase58
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed to send');

      setText('');
      mutate();
    } catch (e) {
      console.error(e);
      alert((e as any)?.message || 'Error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-black/40 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-black">RoR • Direct Chat</div>
          <div className="flex items-center gap-3">
            {/* Dashboard links */}
            {mounted && (
              <div className="flex items-center gap-2">
                <Link href="/fan" className="text-xs underline opacity-80 hover:opacity-100">
                  My chats
                </Link>
                <Link href="/creator/creator-demo" className="text-xs underline opacity-80 hover:opacity-100">
                  Creator dashboard
                </Link>
              </div>
            )}
            <div className="text-sm text-muted">
              Timer: {mounted ? (timeLeft || '—') : '—'}
            </div>
            {mounted && lastTx && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-accent/20 border border-accent/40">
                Escrow init: {lastTx.slice(0, 10)}…
              </span>
            )}
            {mounted && (
              <WalletMultiButton className="!bg-accent !text-black !rounded-xl !h-8 !px-3 !py-0" />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="card p-4 flex flex-col gap-3">
          {/* Bind-fan banner (Stripe -> bind to wallet) */}
          {mounted && thread?.paid_via === 'stripe' && !thread?.fan_pubkey && (
            <div className="p-3 rounded-lg border border-accent/40 bg-accent/10 text-sm flex items-center justify-between">
              <span>Bind this conversation to your connected wallet for future payouts & history.</span>
              <button
                className="btn"
                onClick={async ()=>{
                  if(!wallet.publicKey){ alert('Connect your wallet first.'); return; }
                  try{
                    const signed = await signBindFan(wallet as any, { threadId: thread.id });
                    const r = await fetch('/api/thread/bind-fan',{
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({
                        threadId: thread.id,
                        ...signed
                      })
                    });
                    const j = await r.json();
                    if(!r.ok) throw new Error(j?.error || 'Bind failed');
                    mutate();
                  }catch(e:any){ alert(e?.message || 'Error'); }
                }}
              >
                Bind to my wallet
              </button>
            </div>
          )}

          {/* Role switch (demo only) */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setRole('fan')}
              className={
                'px-3 py-1 rounded-full text-sm border ' +
                (role === 'fan' ? 'bg-accent text-black border-transparent' : 'border-white/20')
              }
            >
              As Fan
            </button>
            <button
              onClick={() => setRole('creator')}
              className={
                'px-3 py-1 rounded-full text-sm border ' +
                (role === 'creator' ? 'bg-accent text-black border-transparent' : 'border-white/20')
              }
            >
              As Creator
            </button>
          </div>

          {/* Message list */}
          <div ref={listRef} className="h-[60vh] overflow-y-auto space-y-3 pr-2">
            {(messages || []).map((m: any) => (
              <div
                key={m.id}
                className={
                  'max-w-[80%] px-4 py-2 rounded-2xl ' +
                  (m.from === 'fan'
                    ? 'bg-white text-black self-start'
                    : 'bg-accent/20 border border-accent/40 self-end')
                }
              >
                <div className="text-xs opacity-60">{m.from}</div>
                <div>{m.body}</div>
              </div>
            ))}
            {!messages?.length && <div className="text-muted">No messages yet — send the first one…</div>}
          </div>

          {/* Input area */}
          <div className="flex flex-col gap-2">
            {!isConnected && (
              <>
                <div className="text-xs text-yellow-300/90 bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 rounded-lg">
                  Connect your wallet to chat — or pay with card to start a chat without a wallet.
                </div>
                <button
                  onClick={async ()=>{
                    if(!text.trim()){
                      alert('Type your first message before paying.');
                      return;
                    }
                    const r = await fetch('/api/checkout/create',{
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({
                        creator: 'creator-demo', // TODO: real creator handle
                        amount: 20,
                        ttlHours: 48,
                        firstMessage: text
                      })
                    });
                    const j = await r.json();
                    if(j?.url) window.location.href = j.url;
                  }}
                  className="btn"
                >
                  Pay with Card / Apple Pay
                </button>
              </>
            )}

            <textarea
              className="input min-h-[48px] max-h-40 resize-y disabled:opacity-50"
              placeholder={
                role === 'creator'
                  ? 'Type your reply… (Shift+Enter = line break)'
                  : 'Type your message… (Shift+Enter = line break)'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                const isMobile =
                  typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
                if (e.key === 'Enter') {
                  // Desktop: Enter = send, Shift+Enter = newline
                  // Mobile: Enter = newline (send via button)
                  if (!isMobile && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) send();
                  }
                }
              }}
              disabled={!isConnected}
            />
            <div className="flex gap-2 items-center">
              <button onClick={send} className="btn disabled:opacity-60" disabled={!canSend}>
                {sending ? 'Sending…' : 'Send & lock'}
              </button>
              <span className="text-xs text-muted">
                {!thread
                  ? 'A new conversation will be created.'
                  : role === 'creator'
                  ? 'Send a substantial answer (≥30 chars) — escrow auto-pays.'
                  : 'Enter = send (desktop), Shift+Enter = line break. On mobile: Enter = line break.'}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted">
            *MVP uses an escrow stub on the server. On-chain receipts will show here once the program is deployed.
          </p>
        </div>
      </main>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  return { props: { handle: ctx.params.slug } };
}
