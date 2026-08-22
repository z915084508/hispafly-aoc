import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
const tabs = [["overview","/pilot/dashboard"],["career","/pilot/career"],["pireps","/pilot/pireps"],["performance","/pilot/performance"],["wallet","/pilot/wallet"],["awards","/pilot/awards"]] as const;
export async function PilotHubNav(){const {t}=await getTranslations();return <nav className="pilot-hub-nav" aria-label="Pilot Hub">{tabs.map(([key,href])=><Link href={href} key={href}>{t(`pilotNav.${key}`)}</Link>)}</nav>}
