import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Good Earth Investment Tracker",
  description: "Internal investment agreement tracking system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${mono.variable} ${serif.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
