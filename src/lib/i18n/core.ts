import es from "@/messages/es.json";
import en from "@/messages/en.json";

export type Locale = "es" | "en";
export type Messages = typeof es;
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "hispafly_locale";
export const messages: Record<Locale, Messages> = { es, en };

export function normalizeLocale(value?: string | null): Locale | null {
  if (!value) return null;
  const normalized = value.toLowerCase().split(/[-_]/)[0];
  return normalized === "en" || normalized === "es" ? normalized : null;
}

export function translate(dictionary: Messages, key: string, values?: Record<string, string | number>) {
  let current: unknown = dictionary;
  for (const part of key.split(".")) current = current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined;
  let result = typeof current === "string" ? current : key;
  for (const [name, value] of Object.entries(values ?? {})) result = result.replaceAll(`{${name}}`, String(value));
  return result;
}

export function localeTag(locale: Locale) { return locale === "en" ? "en-US" : "es-ES"; }
export function formatDate(value: Date | string | number, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(localeTag(locale), options).format(new Date(value));
}
export function formatCurrency(cents: number, locale: Locale, currency = "EUR") {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}
