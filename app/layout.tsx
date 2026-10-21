import type { Metadata } from "next";
import "./globals.css";
import "./ambient.css";
import "./live-ambient.css";
import "./product.css";

export const metadata: Metadata = {
  title: "Heartbeat · Living visuals",
  description: "A quiet world that evolves alongside yours.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

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
