import type { Metadata } from "next";
import "./globals.css";
import WorkshopClient from './workshop-client';

export const metadata: Metadata = {
  metadataBase: new URL("https://suspiciouscloudgames.github.io"),
  title: "Loopntale Workshop",
  description: "Loopntale Workshop",
  alternates: { canonical: "/ma/" },
  openGraph: {
    title: "Loopntale Workshop",
    description: "Loopntale Workshop",
    siteName: "Loopntale Workshop",
    url: "/ma/",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Loopntale Workshop",
    description: "Loopntale Workshop",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<WorkshopClient/></body>
    </html>
  );
}
