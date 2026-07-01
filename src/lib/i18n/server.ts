import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, messages, normalizeLocale, translate } from "./core";

export async function getLocale() {
  const cookieLocale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;
  const browserLocale = normalizeLocale((await headers()).get("accept-language")?.split(",")[0]);
  return browserLocale ?? DEFAULT_LOCALE;
}

export async function getTranslations() {
  const locale = await getLocale();
  return { locale, messages: messages[locale], t: (key: string, values?: Record<string, string | number>) => translate(messages[locale], key, values) };
}
