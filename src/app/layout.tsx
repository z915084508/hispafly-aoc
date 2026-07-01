import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getTranslations } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "HISPAFLY AOC", description: "Portal de operaciones para el personal de HISPAFLY" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const i18n = await getTranslations();
  return <html lang={i18n.locale}><body><I18nProvider locale={i18n.locale} messages={i18n.messages}>{children}</I18nProvider></body></html>;
}
