import Link from "next/link";
const tabs = [["Overview","/pilot/dashboard"],["Career","/pilot/career"],["Flights","/pilot/pireps"],["Performance","/pilot/performance"],["Wallet","/pilot/wallet"],["Awards","/pilot/awards"]] as const;
export function PilotHubNav(){return <nav className="pilot-hub-nav" aria-label="Pilot Hub">{tabs.map(([label,href])=><Link href={href} key={href}>{label}</Link>)}</nav>}
