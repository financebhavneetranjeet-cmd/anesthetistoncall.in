import type { Metadata, Viewport } from "next";
import { PwaInstall } from "@/components/pwa/pwa-install";
import { PwaUpdate } from "@/components/pwa/pwa-update";
import { NotificationPermission } from "@/components/pwa/notification-permission";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anesthetist on Call — Amritsar",
  description: "Secure coordination for verified hospitals, anesthetists and surgeons in Amritsar.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Anesthetist on Call",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><script src="/pwa-bootstrap.js" /></head>
      <body className="min-w-0 overflow-x-hidden antialiased">{children}<PwaInstall /><NotificationPermission /><PwaUpdate /></body>
    </html>
  );
}
