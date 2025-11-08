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

export default function Home({ refCode }: HomeProps) {
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [myCreator, setMyCreator] = useState<null | {
    handle: string;
    displayName: string;
    avatarDataUrl: string | null;
  }>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    t('page_view', { scope: 'home' });
  }, []);

  // Falls Wallet verbunden → checken, ob diese Wallet bereits einem Creator gehört
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
      {/* HEADER */}
      <header className="w-full border-b border-white/10 bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2">
            {mounted && wallet.publicKey && myCreator?.handle && (
              <Link
                href={`/creator/${myCreator.handle}`}
                className="text-sm px-3 py-1.5 rounded-full bg-white text-black"
                onClick={() =>
                  t('cta_click', { scope: 'home', props: { cta: 'go_dashboard' } })
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

      {/* HERO */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-12 lg:py-16 grid gap-10 lg:grid-cols-2 items-center">
          {/* LEFT */}
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-50 text-xs">
              Built in Germany 🇩🇪
              <span className="text-white/50">— EU-first & refund-safe</span>
            </span>

            <h1 className="text-4xl md:text-5xl font-black leading-tight">
              Get paid to answer DMs.
              <br />
              <span className="text-white/45">No reply? Fan gets an automatic refund.</span>
            </h1>

            <p className="text-white/60 text-sm md:text-base max-w-xl">
              Set your price and reply window. Fans pay (card or wallet) to message you.
              If you reply in time, escrow releases automatically. If you don’t, funds go back to the fan.
              No spam. No awkwardness. Just signal.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              {!mounted || !wallet.publicKey || !myCreator?.handle ? (
                <>
                  <Link
                    href={joinUrl}
                    className="btn"
                    onClick={() =>
                      t('cta_click', { scope: 'home', props: { cta: 'join_creator' } })
                    }
                  >
                    I’m a creator
                  </Link>
                  <Link
                    href="/fan"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5"
                    onClick={() =>
                      t('cta_click', { scope: 'home', props: { cta: 'fan_dashboard' } })
                    }
                  >
                    I’m a fan
                  </Link>
                  <Link
                    href={chatDemoUrl}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/0 text-sm text-white/60 hover:bg-white/5"
                    onClick={() =>
                      t('cta_click', { scope: 'home', props: { cta: 'demo_chat' } })
                    }
                  >
                    Try a demo chat →
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href={`/creator/${myCreator.handle}`}
                    className="btn"
                    onClick={() =>
                      t('cta_click', { scope: 'home', props: { cta: 'go_dashboard' } })
                    }
                  >
                    Go to my dashboard
                  </Link>
                  <Link
                    href={`/c/${myCreator.handle}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm hover:bg-white/5"
                    onClick={() =>
                      t('cta_click', { scope: 'home', props: { cta: 'share_chat_link' } })
                    }
                  >
                    Share my chat link
                  </Link>
                </>
              )}
            </div>

            {/* Quick facts */}
            <div className="flex flex-wrap gap-5 items-start text-xs text-white/45">
              <Fact title="48h reply window" subtitle="auto-refund after" />
              <Fact title="Card or wallet" subtitle="for fans" />
              <Fact title="On-chain ready" subtitle="escrow receipts" />
              <Fact title="Referrals" subtitle="creator→creator upside" />
            </div>

            {/* Wallet state hint */}
            {mounted && wallet.publicKey && !myCreator?.handle && (
              <div className="text-[11px] text-white/40">
                {checking
                  ? 'Checking your wallet…'
                  : (
                    <>
                      No creator inbox bound to this wallet.{' '}
                      <Link
                        className="underline"
                        href={joinUrl}
                        onClick={() =>
                          t('cta_click', { scope: 'home', props: { cta: 'join_from_hint' } })
                        }
                      >
                        Create one
                      </Link>.
                    </>
                  )}
              </div>
            )}
          </div>

          {/* RIGHT – glass chat mock */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-5 md:p-6 backdrop-blur-xl space-y-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/logo-ror-glass.svg" alt="RoR" className="h-10 w-10 rounded-2xl border border-white/10" />
                <div>
                  <div className="text-sm font-semibold">Chat with @creator</div>
                  <div className="text-[10px] text-white/35">43m left • escrow locked</div>
                </div>
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/25">
                €20
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="max-w-[80%] bg-white text-black rounded-2xl rounded-bl-md px-3 py-2 shadow-sm">
                Hey, quick question about your drop 👀
              </div>
              <div className="max-w-[80%] bg-black/25 border border-white/5 rounded-2xl rounded-br-md px-3 py-2 ml-auto shadow-sm">
                Thanks for reaching out 🙌 what do you want to know exactly?
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
        </section>

        {/* HOW IT WORKS */}
        <section className="max-w-6xl mx-auto px-4 pb-8">
          <h2 className="text-lg font-semibold mb-4">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              step="1"
              title="Claim your handle"
              text="Pick a name, upload your avatar, connect your wallet. Done in one minute."
            />
            <FeatureCard
              step="2"
              title="Share your chat link"
              text="Fans pay by card or wallet and send their first message to your inbox."
            />
            <FeatureCard
              step="3"
              title="Reply or refund"
              text="Reply within your window to get paid. If not, refund triggers automatically."
            />
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-6xl mx-auto px-4 pb-12">
          <h2 className="text-lg font-semibold mb-4">FAQ</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Faq q="How do fans pay?" a="Via card (Stripe) or crypto wallet. Their first message is included in the payment flow." />
            <Faq q="Where do I get paid?" a="Funds release to your connected wallet when you send a substantial reply within the timer." />
            <Faq q="What if I don’t reply?" a="The chat auto-refunds to the fan when the timer expires. Trust by default." />
            <Faq q="Can I set my own price?" a="Yes. You control price and the reply window in your dashboard settings." />
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

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold">{q}</div>
      <p className="text-sm text-white/60 mt-1">{a}</p>
    </div>
  );
}

// Redirect invite links straight to creator onboarding
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
