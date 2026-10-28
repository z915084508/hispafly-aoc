"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "@/lib/i18n/client";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function subscribeDisplayMode(callback: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

const copy = {
  es: {
    install: "Instalar HISPAFLY AOC", help: "Cómo instalar la aplicación", title: "HISPAFLY AOC en tu dispositivo",
    ios: "iPhone / iPad: abre esta web en Safari, pulsa Compartir y selecciona Añadir a pantalla de inicio. Activa Abrir como app web si aparece.",
    android: "Android: abre el menú de Chrome y selecciona Instalar aplicación o Instalar y crear acceso directo → Instalar.",
    windows: "Windows: usa el icono de instalación de Edge o Chrome, o su menú de aplicaciones para instalar este sitio.",
    note: "Las opciones varían según el navegador. Si solo aparece un acceso directo, prueba con un navegador compatible. Los vuelos y las operaciones requieren conexión.",
    update: "Hay una nueva versión de HISPAFLY AOC. Guarda tu trabajo antes de actualizar esta ventana.",
    reload: "Actualizar y recargar", later: "Más tarde", failed: "No se pudo iniciar la instalación. Consulta las instrucciones del navegador.",
  },
  en: {
    install: "Install HISPAFLY AOC", help: "How to install the app", title: "HISPAFLY AOC on your device",
    ios: "iPhone / iPad: open this website in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if offered.",
    android: "Android: open the Chrome menu and select Install app or Install and create shortcut → Install.",
    windows: "Windows: use the install icon in Edge or Chrome, or the browser's apps menu to install this site.",
    note: "Options vary by browser. If only a shortcut is offered, try a supported browser. Flights and operations require an internet connection.",
    update: "A new HISPAFLY AOC version is ready. Save your work before updating this window.",
    reload: "Update and reload", later: "Later", failed: "Installation could not start. Follow the browser instructions.",
  },
};

export function PwaControls() {
  const { locale } = useTranslations();
  const text = copy[locale];
  const standalone = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let offered: ServiceWorker | null = null;
    const cleanups: (() => void)[] = [];
    const offerUpdate = () => {
      const worker = registration?.waiting;
      if (!disposed && navigator.serviceWorker.controller && worker && worker !== offered) {
        offered = worker;
        setWaiting(worker);
      }
    };
    const controllerChanged = () => {
      // Other tabs must not reload in the middle of flight forms.
      if (reloadRequested.current) window.location.reload();
    };
    const checkUpdate = () => {
      if (document.visibilityState === "visible") {
        offerUpdate();
        void registration?.update().catch(() => { /* Keep using the current version while offline. */ });
      }
    };
    const watchInstalling = () => {
      const worker = registration?.installing;
      if (!worker) return;
      const stateChanged = () => { if (worker.state === "installed") offerUpdate(); };
      worker.addEventListener("statechange", stateChanged);
      cleanups.push(() => worker.removeEventListener("statechange", stateChanged));
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((result) => {
      if (disposed) return;
      registration = result;
      offerUpdate();
      watchInstalling();
      registration.addEventListener("updatefound", watchInstalling);
      document.addEventListener("visibilitychange", checkUpdate);
      void registration.update().catch(() => {});
    }).catch(() => { /* Installation help and the online portal remain usable without a worker. */ });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", watchInstalling);
      document.removeEventListener("visibilitychange", checkUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setInstalling(true);
    setInstallFailed(false);
    try {
      // The browser prompt is only invoked directly from this user click.
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
    } catch {
      setInstallFailed(true);
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <>
      {waiting && <aside className="pwa-update" role="status">
        <p>{text.update}</p>
        <div className="pwa-actions">
          <button type="button" onClick={() => {
            // Another window may already have activated this worker. Reload only
            // when this window's user chooses to do so, even in that case.
            if (waiting.state !== "installed") { window.location.reload(); return; }
            reloadRequested.current = true;
            waiting.postMessage({ type: "AOC_ACTIVATE_UPDATE" });
          }}>{text.reload}</button>
          <button type="button" onClick={() => setWaiting(null)}>{text.later}</button>
        </div>
      </aside>}
      {!standalone && !installed && <footer className="pwa-install">
        {prompt && <button type="button" disabled={installing} onClick={() => void install()}>{text.install}</button>}
        {installFailed && <p role="status">{text.failed}</p>}
        <details><summary>{text.help}</summary><div className="pwa-help">
          <strong>{text.title}</strong>
          <p>{text.ios}</p><p>{text.android}</p><p>{text.windows}</p><p>{text.note}</p>
        </div></details>
      </footer>}
    </>
  );
}
