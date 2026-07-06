import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/data-table";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";

export const dynamic = "force-dynamic";

export default async function StaffFuelPolicyPage() {
  await requireAdminStaff();
  const policies = await prisma.fuelPolicyProfile.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return <>
    <PageHeading eyebrow="FLIGHT OPERATIONS" title="HISPAFLY Fuel Policy" copy="Active fuel planning rules applied automatically to SimBrief API V2 OFP generation."/>
    <section className="card"><div className="card-header"><h2 className="card-title">Policy profiles</h2><span className="meta">{policies.filter((item) => item.active).length} active</span></div>
      <div className="table-wrapper"><table><thead><tr><th>Policy</th><th>Scope</th><th>Route / Region</th><th>Contingency</th><th>Reserve</th><th>ATC / Weather</th><th>MEL / Extra</th><th>Tankering</th><th>Status</th></tr></thead><tbody>{policies.map((policy) => <tr key={policy.id}>
        <td><strong>{policy.name}</strong></td><td>{policy.scope}</td><td>{policy.routeType ?? "ALL"} / {policy.region ?? "ALL"}</td><td>{policy.contingencyRule}</td><td>{policy.finalReserveRule} min</td><td>{policy.atcFuelMinutes ?? 0} / {policy.weatherFuelMinutes ?? 0} min</td><td>{policy.melFuelKg ?? 0} / {policy.extraFuelKg ?? 0} kg</td><td>{policy.tankeringAllowed ? "Allowed" : "Disabled"}</td><td><Badge tone={policy.active ? "green" : "amber"}>{policy.active ? "ACTIVE" : "INACTIVE"}</Badge></td>
      </tr>)}</tbody></table></div>
      {!policies.length && <div className="empty-state">No fuel policies are configured. Deploy the latest database migration to install the defaults.</div>}
    </section>
    <section className="card"><h2 className="card-title">Maintenance restriction overlay</h2><p>Aircraft condition below 40% automatically adds 500 kg MEL fuel and 500 kg OPN extra fuel to the SimBrief payload.</p></section>
  </>;
}
