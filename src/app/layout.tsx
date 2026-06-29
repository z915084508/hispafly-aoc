import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "HISPAFLY AOC", description: "Pilot and staff portals for HISPAFLY" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
