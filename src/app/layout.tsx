// src/app/layout.tsx
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
const inter = Inter({ subsets: ['latin'] });
export const metadata: Metadata = {
    title: 'マケボランキング | FF14 マーケット分析',
    description: 'Universalis API を利用したファイナルファンタジー14のマーケット分析ツール',
    keywords: ['FF14', 'FFXIV', 'Universalis', 'マーケット', 'リテイナー'],
};
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ja">
            <body className={inter.className}>{children}<SpeedInsights /> <Analytics /></body>
        </html>
    );
}