import Link from "next/link";
import { prisma } from "@/lib/prisma";
export default async function CutoverEntityQueue({ params, searchParams }: { params: Promise<{ entityType: string }>; searchParams: Promise<{ issue?: string; q?: string }> }) {
  const [{ entityType }, query] = await Promise.all([params, searchParams]);
  const rows = await prisma.nativeCutoverReviewItem.findMany({ where: { entityType, status: "PENDING", ...(query.issue ? { issueType: query.issue } : {}), ...(query.q ? { sourceId: { contains: query.q, mode: "insensitive" } } : {}) }, orderBy: { createdAt: "desc" }, take: 250 });
  return <><div className="page-header"><div><div className="eyebrow">REVIEW QUEUE</div><h1>{entityType}</h1><p>Ambiguous records require explicit Staff review.</p></div></div><table><thead><tr><th>Source</th><th>Classification</th><th>Issue</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/staff/native-cutover/review/${row.id}`}>{row.sourceId}</Link></td><td>{row.classification}</td><td>{row.issueType}</td><td>{row.status}</td></tr>)}</tbody></table></>;
}
