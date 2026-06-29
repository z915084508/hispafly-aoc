import Image from "next/image";
import Link from "next/link";

export default function PilotLayout({ children }: { children: React.ReactNode }) {
  return <div className="pilot-shell"><header className="pilot-header"><Link href="/" className="pilot-logo"><Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority /></Link><nav><Link href="/pilot">Overview</Link><Link href="/">Switch portal</Link></nav></header>{children}</div>;
}
