// pages/checkout/success.tsx
import { useRouter } from 'next/router';
import useSWR from 'swr';
import Link from 'next/link';

const fetcher = (u:string)=>fetch(u).then(r=>r.json());

export default function Success(){
  const router = useRouter();
  const sid = router.query.sid as string | undefined;
  const { data } = useSWR(()=> sid ? `/api/checkout/lookup?sid=${sid}` : null, fetcher);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="card p-6 space-y-4 max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold">Payment successful</h1>
        {data?.threadId ? (
          <>
            <p className="text-muted">Your conversation is ready.</p>
            <Link href={`/c/${data.threadId}`} className="btn">Open your chat</Link>
          </>
        ) : (
          <>
            <p className="text-muted">We are confirming your session…</p>
            <p className="text-xs text-muted">If it doesn’t resolve, contact support with your session id: <code>{sid}</code></p>
          </>
        )}
      </div>
    </div>
  );
}
