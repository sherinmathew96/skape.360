import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SKAPE360", template: "%s · SKAPE360" },
  description: "Studio Skape's projects, site work and team in one place.",
  metadataBase: new URL("https://360.studioskape.in"),
  // The K mark as the picture in WhatsApp and other link previews.
  openGraph: { siteName: "Studio Skape", images: [{ url: "/icon-maskable-512.png", width: 512, height: 512, alt: "Studio Skape" }] },
  twitter: { card: "summary" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "SKAPE360", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fafbff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
