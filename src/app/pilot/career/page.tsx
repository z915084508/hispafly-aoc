import { Badge } from "@/components/data-table";
import { PilotHubNav } from "@/components/pilot-hub-nav";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getPilotHubData } from "@/lib/pilot/portalData";
import { requirePilotSession } from "@/lib/pilot/session";
import { CareerProgressBar } from "@/components/career-progress-bar";
import { getTranslations } from "@/lib/i18n/server";
export const dynamic="force-dynamic";
export default async function CareerPage(){const pilot=await requirePilotSession();const [hub,{t}]=await Promise.all([getPilotHubData(pilot.id),getTranslations()]);return <PilotPortalShell><PilotHubNav/><div className="page-header"><div><p className="eyebrow">{t("career.eyebrow")}</p><h1>{t("career.title",{rank:hub.rank})}</h1><p>{t("career.copy")}</p></div><Badge tone={hub.career.eligible?"green":"amber"}>{hub.career.eligible?(hub.career.approval?t("career.eligible"):t("career.ready")):`${hub.career.percent}%`}</Badge></div><section className="card"><h2>{hub.career.next?`${hub.rank} → ${hub.career.next}`:t("career.seniorCaptain")}</h2><CareerProgressBar percent={hub.career.percent}/>{hub.career.requirements.map(item=><div className="career-requirement" key={item.label}><div><strong>{item.label}</strong><span>{item.current.toFixed(item.unit==="sectors"?0:1)} / {item.target} {item.unit==="percent"?"%":t(`career.${item.unit}`)}</span></div><CareerProgressBar small percent={item.current/item.target*100}/></div>)}{hub.career.approval&&<p className="meta">{t("career.approval")}</p>}</section><section className="card"><h2>{t("career.structure")}</h2><div className="rank-track">{["TRN","FO","SFO","CPT","SCPT"].map(rank=><span className={rank===hub.rank?"current":""} key={rank}>{rank}</span>)}</div></section></PilotPortalShell>}
