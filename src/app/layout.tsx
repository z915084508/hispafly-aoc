import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getTranslations } from "@/lib/i18n/server";
import { PwaControls } from "@/components/pwa-controls";

export const metadata: Metadata = {
  title: "HISPAFLY AOC",
  description: "Portal de operaciones para el personal de HISPAFLY",
  applicationName: "HISPAFLY AOC",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "16x16 32x32 48x48" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "HISPAFLY AOC", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#07111f",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const i18n = await getTranslations();
  return <html lang={i18n.locale}><body><I18nProvider locale={i18n.locale} messages={i18n.messages}>{children}<PwaControls /></I18nProvider></body></html>;
}
