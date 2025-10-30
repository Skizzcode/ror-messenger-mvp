// pages/_app.tsx
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Reply or Refund</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo-ror-glass.svg" />
      </Head>
      <div className="bg-[#0A0B0E] min-h-screen">
        <Component {...pageProps} />
      </div>
    </>
  );
}
