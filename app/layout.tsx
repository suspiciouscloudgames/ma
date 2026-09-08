import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모바일 고고학",
  description: "모두의 사진이 한 화면에 모이는 실시간 포토 월",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
