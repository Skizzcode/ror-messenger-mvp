// pages/privacy.tsx
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      <header className="border-b border-white/10 bg-background/70 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-ror-glass.svg" className="h-8 w-8 rounded-2xl border border-white/10" alt="RoR" />
            <span className="text-sm font-semibold">Reply or Refund</span>
          </Link>
          <span className="text-xs text-white/40">Privacy / Data protection</span>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Privacy policy</h1>
        <p className="text-sm text-white/65">
          This MVP stores conversations, creator settings and wallet public keys in a hosted database (Upstash/Redis).
          We do not store private keys. Wallet connections happen in your browser.
        </p>
        <h2 className="text-lg font-semibold mt-4">What we store</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-white/65">
          <li>creator handle, display name, avatar (data URL)</li>
          <li>fan wallet public key (to show chats)</li>
          <li>threads, messages, deadlines, statuses</li>
          <li>referral codes to calculate creator-to-creator rewards</li>
        </ul>
        <p className="text-sm text-white/50">
          For Stripe-based payments, Stripe’s own privacy policy applies. We only store the minimum data required to
          link a payment to a chat.
        </p>
        <p className="text-xs text-white/35">
          Replace this text with your actual GDPR/DSGVO copy once you go live.
        </p>
      </main>
      <footer className="border-t border-white/10 py-4 text-center text-xs text-white/35">
        <Link href="/" className="hover:text-white/70">← Back to home</Link>
      </footer>
    </div>
  );
}
