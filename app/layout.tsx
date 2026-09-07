import type { Metadata } from "next";
import { Nanum_Myeongjo } from "next/font/google";
import "./globals.css";

const nanumMyeongjo = Nanum_Myeongjo({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-nanum-myeongjo",
});

export const metadata: Metadata = {
  title: "기척의 놀이 けはいのあそび",
  description: "모두의 사진이 한 화면에 모이는 실시간 포토 월",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={nanumMyeongjo.variable}>{children}</body>
    </html>
  );
}
