import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "HISPAFLY AOC", description: "Portal de operaciones para el personal de HISPAFLY" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
