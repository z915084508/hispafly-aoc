import type { Metadata } from "next";
import { PortalShell } from "@/components/portal-shell";
import "./globals.css";

export const metadata: Metadata = { title: "HISPAFLY AOC", description: "Portal de operaciones para el personal de HISPAFLY" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><PortalShell>{children}</PortalShell></body></html>;
}
