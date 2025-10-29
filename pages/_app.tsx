// pages/_app.tsx
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { WalletCtx } from '/components/WalletCtx';
export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletCtx>
      <Component {...pageProps} />
    </WalletCtx>
  );
}
