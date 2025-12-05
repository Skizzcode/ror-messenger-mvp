// pages/index.tsx
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { t } from '../lib/telemetry';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

type HomeProps = { refCode: string | null };

const TRUST_STATS = [
  { label: 'Answer rate', value: '92%' },
  { label: 'Refund rate', value: '<2%' },
  { label: 'Creators verified', value: '100%' },
];

export default function Home({ refCode }: HomeProps) {
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [myCreator, setMyCreator] = useState<null | {
    handle: string;
    displayName: string;
    avatarDataUrl: string | null;
  }>(null);
  const [heroNoir, setHeroNoir] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    t('page_view', { scope: 'public_home' });
  }, []);

  useEffect(() => {
    let stop = false;
    async function run() {
      if (!wallet.publicKey) {
        setMyCreator(null);
        return;
      }
      setChecking(true);
      try {
        const pk = wallet.publicKey.toBase58();
        const r = await fetch(`/api/creator-by-wallet?wallet=${encodeURIComponent(pk)}`);
        const j = await r.json();
        if (!stop) {
          setMyCreator(
            j?.ok
              ? {
                  handle: j.handle,
                  displayName: j.displayName,
                  avatarDataUrl: j.avatarDataUrl || null,
                }
              : null
          );
          if (j?.ok && j.handle) {
            t('dashboard_view', { scope: 'creator', handle: j.handle });
          }
        }
      } catch {
        if (!stop) setMyCreator(null);
      } finally {
        if (!stop) setChecking(false);
      }
    }
    run();
    return () => {
      stop = true;
    };
  }, [wallet.publicKey]);

  const chatDemoUrl = '/c/creator-demo';
  const joinUrl = refCode ? `/creator/join?ref=${encodeURIComponent(refCode)}` : '/creator/join';

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {/* GLOBAL HEADER */}
      <header className="w-full border-b border-white/10 bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo-ror-glass.svg"
              alt="RoR"
              className="h-10 w-10 rounded-2xl shadow-lg"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Reply or Refund</div>
              <div className="text-[10px] text-white/40">Paid DMs for creators</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {mounted && wallet.publicKey && myCreator?.handle && (
              <Link
                href={`/creator/${myCreator.handle}`}
                className="text-sm px-3 py-1.5 rounded-full bg-white text-black"
                onClick={() =>
                  t('cta_click', { scope: 'public_home', props: { cta: 'go_dashboard' } })
                }
              >
                Go to my dashboard
              </Link>
            )}
            {mounted && (
              <WalletMultiButton className="!bg-white !text-black !rounded-xl !h-8 !px-3 !py-0 !text-sm" />
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 via-cyan-400/10 to-transparent pointer-events-none" />
          <div className="max-w-6xl mx-auto px-4 py-12 lg:py-16 grid gap-10 lg:grid-cols-2 items-center relative z-10">
            {/* LEFT */}
            <div className="space-y-7">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-emerald-100 text-xs">
                Built in Germany
                <span className="text-white/50">· Refund-first DM platform</span>
              </span>

              <h1 className="text-4xl md:text-5xl font-black leading-tight">
                The paid DM lane for creators.
                <br />
                <span className="text-white/45">Fans pay. You reply. Miss it? Auto-refund.</span>
              </h1>

              <p className="text-white/60 text-sm md:text-base max-w-xl">
                Set a price and reply window. Every chat is escrowed. Reply in time to unlock earnings; if you don’t, the fan is refunded—no disputes, no spam. Wallet-first, card-friendly, EU-ready.
              </p>

              <div className="flex flex-wrap gap-3">
                {!mounted || !wallet.publicKey || !myCreator?.handle ? (
                  <>
                    <Link
                      href={joinUrl}
                      className="btn"
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'join_creator' } })}
                    >
                      Claim my handle
                    </Link>
                    <Link
                      href={chatDemoUrl}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5"
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'demo_chat' } })}
                    >
                      See a live chat
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/creator/${myCreator.handle}`}
                      className="btn"
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'go_dashboard' } })}
                    >
                      Go to my dashboard
                    </Link>
                    <Link
                      href={`/c/${myCreator.handle}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5"
                      onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'share_chat_link' } })}
                    >
                      Share my chat
                    </Link>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl text-sm">
                {TRUST_STATS.map((stat) => (
                  <div key={stat.label} className="card px-3 py-2 rounded-xl">
                    <div className="text-[11px] text-white/50">{stat.label}</div>
                    <div className="text-base font-semibold">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-5 items-start text-xs text-white/45">
                <Fact title="48h reply window" subtitle="auto-refund after" />
                <Fact title="Card or wallet" subtitle="for fans" />
                <Fact title="Audit log" subtitle="admin trail" />
                <Fact title="Invite-only" subtitle="early access" />
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-white/60">
                <button
                  className="px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
                  onClick={() => setHeroNoir((v) => !v)}
                >
                  {heroNoir ? 'Show color' : 'Noir view'}
                </button>
              </div>

              {mounted && wallet.publicKey && !myCreator?.handle && (
                <div className="text-[11px] text-white/40">
                  {checking ? 'Checking your wallet…' : (
                    <>
                      No creator inbox bound to this wallet.{' '}
                      <Link
                        className="underline"
                        href={joinUrl}
                        onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'join_from_hint' } })}
                      >
                        Create one
                      </Link>.
                    </>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT – glass chat mock */}
            <div
              className="bg-white/5 rounded-3xl p-5 md:p-6 backdrop-blur-xl space-y-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]"
              style={{ filter: heroNoir ? 'grayscale(1) contrast(1.05)' : 'none', transition: 'filter 200ms ease' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="/logo-ror-glass.svg" alt="RoR" className="h-10 w-10 rounded-2xl" />
                  <div>
                    <div className="text-sm font-semibold">Chat with @creator</div>
                    <div className="text-[10px] text-white/35">43m left · escrow locked</div>
                  </div>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/25">
                  €20
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="max-w-[80%] bg-white text-black rounded-2xl rounded-bl-md px-3 py-2 shadow-sm">
                  Hey, quick question about your drop
                </div>
                <div className="max-w-[80%] bg-black/25 border border-white/5 rounded-2xl rounded-br-md px-3 py-2 ml-auto shadow-sm">
                  Thanks for reaching out — what do you want to know exactly?
                </div>
                <div className="text-[10px] text-white/35 mt-3">
                  Reply in time → funds release. No reply → automatic refund.
                </div>
              </div>
              <div className="pt-3 mt-2 border-t border-white/10 grid gap-2 md:grid-cols-2">
                <MiniCard title="No spam" text="Every DM is paid, signal over noise." />
                <MiniCard title="Fair by default" text="Fans always know they’ll get value or a refund." />
              </div>
            </div>
          </div>
        </section>

        {/* Product pillars */}
        <section className="max-w-6xl mx-auto px-4 py-10 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Signal over noise</h2>
              <p className="text-white/60 text-sm">Paid DMs, escrowed, auto-refund. Your time becomes premium; fans see fairness.</p>
            </div>
            <div className="flex gap-2 text-[11px] text-white/60">
              <span className="px-3 py-1 rounded-full bg-white/5">Wallet + card</span>
              <span className="px-3 py-1 rounded-full bg-white/5">Refund SLA</span>
              <span className="px-3 py-1 rounded-full bg-white/5">Receipts</span>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              step="1"
              title="Claim & price"
              text="Pick your handle, set price and reply window. Invite-only toggle keeps access tight."
            />
            <FeatureCard
              step="2"
              title="Share one link"
              text="Fans pay via card or wallet, first message goes to your inbox. Escrow locks instantly."
            />
            <FeatureCard
              step="3"
              title="Reply → unlock"
              text="Your reply releases funds. Miss the timer? Refund auto-triggers. Everyone sees the SLA badge."
            />
          </div>
        </section>

        {/* CTA STRIP */}
        <section className="bg-gradient-to-r from-emerald-400/20 via-white/10 to-cyan-400/20 border-y border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-lg font-semibold">Turn DMs into premium signal.</div>
              <p className="text-white/70 text-sm max-w-2xl">
                Refund-backed, audit-logged, EU-first. One link in bio. Faster replies, happier fans, predictable earnings.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={joinUrl}
                className="btn"
                onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'vision_join' } })}
              >
                Claim my handle
              </Link>
              <Link
                href="/fan"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-sm bg-white/5 hover:bg-white/10"
              >
                See fan view
              </Link>
            </div>
          </div>
        </section>

        {/* Quotes */}
        <section className="max-w-6xl mx-auto px-4 py-8 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-white/60 text-xs">
            <span className="uppercase tracking-[0.2em] text-[10px] text-white/40">Creators on RoR</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <MiniCard title="“Inbox finally calm.”" text="Paid messages only. Replies stay under 24h because every chat is worth it." />
            <MiniCard title="“Fans see fairness.”" text="Refund badge makes it easy to charge without guilt. Trust went up." />
            <MiniCard title="“No ops tax.”" text="Escrow + auto-refund + receipts. I just answer and get paid." />
          </div>
        </section>

        {/* TRUST & COMPLIANCE */}
        <section className="max-w-6xl mx-auto px-4 pb-8 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Trust, compliance, signal</h2>
              <p className="text-white/60 text-sm">EU-first data handling, automatic refunds, audit trails for every DM.</p>
            </div>
            <Link href={joinUrl} className="btn" onClick={() => t('cta_click', { scope: 'public_home', props: { cta: 'trust_join' } })}>
              Start earning
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <MiniCard title="Refund SLA" text="Automatic refund if you miss the window. Fans see the badge upfront." />
            <MiniCard title="Escrow receipts" text="Every chat has a receipt; Stripe + wallet flows, no manual payouts." />
            <MiniCard title="EU-ready" text="Built in Germany. Imprint/privacy, invite-only rollout, admin audit log." />
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-6xl mx-auto px-4 pb-10 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold">FAQ</h2>
            <Link href={joinUrl} className="text-sm underline text-emerald-200">More questions? Contact us</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="card p-4 space-y-1">
              <div className="font-semibold text-sm">How fast can I launch?</div>
              <div className="text-sm text-white/60">Pick a handle, sign with your wallet, set price/window, upload avatar. Live in minutes.</div>
            </div>
            <div className="card p-4 space-y-1">
              <div className="font-semibold text-sm">What if I miss a reply?</div>
              <div className="text-sm text-white/60">Fans auto-refund after your window. SLA badge keeps it transparent; no disputes.</div>
            </div>
            <div className="card p-4 space-y-1">
              <div className="font-semibold text-sm">Card + wallet?</div>
              <div className="text-sm text-white/60">Fans can pay by card or wallet. You reply in one place; escrow unlocks on your reply.</div>
            </div>
            <div className="card p-4 space-y-1">
              <div className="font-semibold text-sm">Can I invite others?</div>
              <div className="text-sm text-white/60">Yes. Share your referral link; you earn when they answer chats. Invite-only switch is supported.</div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="w-full border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap gap-4 items-center justify-between text-xs text-white/40">
          <div>© {new Date().getFullYear()} Reply or Refund — Built in Germany.</div>
          <nav className="flex items-center gap-4">
            <Link className="hover:text-white/80" href="/imprint">Imprint</Link>
            <Link className="hover:text-white/80" href="/privacy">Privacy</Link>
            <Link className="hover:text-white/80" href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Fact({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="leading-tight">
      <div className="text-white font-semibold">{title}</div>
      <div>{subtitle}</div>
    </div>
  );
}

function MiniCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="card p-3 rounded-2xl">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-white/50">{text}</div>
    </div>
  );
}

function FeatureCard({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 w-fit border border-white/15">Step {step}</div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="text-sm text-white/50">{text}</p>
    </div>
  );
}

export async function getServerSideProps(ctx: any) {
  const ref = typeof ctx.query.ref === 'string' ? ctx.query.ref : null;
  if (ref) {
    return {
      redirect: {
        destination: `/creator/join?ref=${encodeURIComponent(ref)}`,
        permanent: false,
      },
    };
  }
  return { props: { refCode: null } };
}
