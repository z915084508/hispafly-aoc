import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { executeCutoverResolutionAction, previewCutoverResolutionAction } from "../../actions";
function previewValue(value?: string) {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return { error: "Invalid preview payload." }; }
}
export default async function CutoverReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string; error?: string; success?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const item = await prisma.nativeCutoverReviewItem.findUnique({ where: { id } });
  if (!item) notFound();
  const preview = previewValue(query.preview);
  return <><div className="page-header"><div><div className="eyebrow">{item.classification}</div><h1>{item.entityType} review</h1><p>{item.sourceId} · {item.issueType}</p></div></div>{query.error&&<div className="notice">{query.error}</div>}{query.success&&<div className="notice success">{query.success}</div>}<section className="card"><h2>Source snapshot</h2><pre>{JSON.stringify(item.sourceSnapshot, null, 2)}</pre><p>{item.warnings.join(" ")}</p></section>{preview&&<section className="card"><h2>Read-only preview</h2><pre>{JSON.stringify(preview, null, 2)}</pre></section>}<form action={previewCutoverResolutionAction}><input type="hidden" name="reviewItemId" value={item.id}/><label>Native target ID<input name="targetNativeId"/></label><label>Decision<select name="decision"><option value="CONFIRM">Confirm explicit link</option><option value="HISTORICAL_ONLY">Historical only</option><option value="REJECT">Reject</option></select></label><button className="button secondary">Preview</button></form><form action={executeCutoverResolutionAction}><input type="hidden" name="reviewItemId" value={item.id}/><input type="hidden" name="operationKey" value={randomUUID()}/><label>Native target ID<input name="targetNativeId"/></label><label>Decision<select name="decision"><option value="CONFIRM">Confirm explicit link</option><option value="HISTORICAL_ONLY">Historical only</option><option value="REJECT">Reject</option></select></label><label>Review note<input name="note" required/></label><button className="button">Execute reviewed decision</button></form></>;
}
