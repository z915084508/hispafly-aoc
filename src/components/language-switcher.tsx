"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useTranslations();
  function select(next: "es" | "en") {
    document.cookie = `hispafly_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }
  return <div className="language-switcher" role="group" aria-label={t("common.language")}>
    <button type="button" className={locale === "es" ? "active" : ""} onClick={() => select("es")}>ES</button>
    <button type="button" className={locale === "en" ? "active" : ""} onClick={() => select("en")}>EN</button>
  </div>;
}
