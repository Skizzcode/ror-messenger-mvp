// pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" className="bg-[#0A0B0E]">
      <Head>
        <link rel="icon" href="/logo-ror-glass.svg" />
        <meta name="theme-color" content="#0A0B0E" />
      </Head>
      <body className="bg-[#0A0B0E] text-white antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
