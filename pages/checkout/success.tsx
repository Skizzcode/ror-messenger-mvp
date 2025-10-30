// pages/checkout/success.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const { sid } = router.query;
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sid) return;
    (async () => {
      try {
        const r = await fetch(`/api/checkout/lookup?sid=${sid}`);
        const j = await r.json();
        setInfo(j);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [sid]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="max-w-md w-full p-6 bg-white/5 rounded-2xl border border-white/10">
        <h1 className="text-2xl font-bold mb-2">Payment successful ✅</h1>
        <p className="text-sm text-white/60 mb-4">
          Thanks! We created your request. If the creator replies in time, funds will be released.
        </p>

        {loading && <p className="text-sm text-white/40">Loading session…</p>}

        {!loading && info?.threadId && (
          <a
            href={`/c/${info.threadId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-400 text-black font-medium"
          >
            Open your chat
          </a>
        )}

        {!loading && !info?.threadId && (
          <p className="text-xs text-red-300 mt-2">
            We did not find a thread for this session yet.
            If you just paid, wait 2–3s and refresh – or the webhook is not configured.
          </p>
        )}

        <p className="text-[10px] text-white/30 mt-4 break-all">
          Session: {sid || '—'}
        </p>
      </div>
    </div>
  );
}
