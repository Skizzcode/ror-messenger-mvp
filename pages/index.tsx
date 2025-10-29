
import Link from 'next/link';

export default function Home(){
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="max-w-md w-full card p-6">
        <h1 className="text-3xl font-black">Reply or Refund</h1>
        <p className="text-muted mt-2">Direktchat mit 48h-Antwortgarantie. Antwort → Payout. Keine Antwort → Auto-Refund.</p>
        <div className="mt-6 space-y-3">
          <Link href="/c/demo" className="btn block text-center">Demo-Chat öffnen</Link>
          <a href="https://vercel.com/new" className="text-sm text-muted underline">Deploy später</a>
        </div>
      </div>
    </div>
  );
}
