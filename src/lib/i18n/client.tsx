"use client";

import { createContext, useContext } from "react";
import type { Locale, Messages } from "./core";
import { translate } from "./core";

const I18nContext = createContext<{ locale: Locale; messages: Messages } | null>(null);
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}
export function useTranslations() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useTranslations must be used inside I18nProvider.");
  return { ...context, t: (key: string, values?: Record<string, string | number>) => translate(context.messages, key, values) };
}
