// pages/_app.tsx
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

// Solana / wallet
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

export default function MyApp({ Component, pageProps }: AppProps) {
  // simple public endpoint
  const endpoint = 'https://api.devnet.solana.com';

  // which wallets to show
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <>
      <Head>
        <title>Reply or Refund</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo-ror-glass.svg" />
      </Head>
      <div className="app-shell">
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              <Component {...pageProps} />
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </div>

      <style jsx global>{`
        .app-shell {
          min-height: 100vh;
          background: #0a0b0e;
        }
      `}</style>
    </>
  );
}
