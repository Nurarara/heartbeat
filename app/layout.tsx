import type { Metadata } from "next";
import "./globals.css";
import "./ambient.css";
import "./live-ambient.css";
import "./product.css";
import "./onboarding.css";

export const metadata: Metadata = {
  title: "Heartbeat · Living visuals",
  description: "A quiet world that evolves alongside yours.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  // Add to Home Screen (iPhone, iPad, Android): opens the display full-screen.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Heartbeat", statusBarStyle: "black-translucent" },
};

export const viewport = { themeColor: "#070b10", viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
