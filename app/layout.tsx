import type { Metadata } from "next";
import "./globals.css";
import WorkshopClient from './workshop-client';

export const metadata: Metadata = {
  metadataBase: new URL("https://suspiciouscloudgames.github.io"),
  title: "기척의 놀이 | Play of Traces",
  description: "기척의 놀이 | Play of Traces",
  alternates: { canonical: "/ma/" },
  openGraph: {
    title: "기척의 놀이 | Play of Traces",
    description: "기척의 놀이 | Play of Traces",
    siteName: "기척의 놀이 | Play of Traces",
    url: "/ma/",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "기척의 놀이 | Play of Traces",
    description: "기척의 놀이 | Play of Traces",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<WorkshopClient/></body>
    </html>
  );
}
