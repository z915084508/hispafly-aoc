"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/client";

export function PilotNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { locale } = useTranslations();
  return <aside className={`sidebar pilot-sidebar${open ? " pilot-nav-open" : ""}`}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.getElementById(`${id}-toggle`)?.focus();
      }
    }}>
    <button id={`${id}-toggle`} className="pilot-menu-toggle" type="button" aria-expanded={open}
      aria-controls={id} onClick={() => setOpen(!open)}>
      ☰ {locale === "es" ? "Menú del piloto" : "Pilot menu"}
    </button>
    <div id={id} className="pilot-navigation-content" onClick={(event) => {
      if ((event.target as HTMLElement).closest("a")) setOpen(false);
    }}>{children}</div>
  </aside>;
}
