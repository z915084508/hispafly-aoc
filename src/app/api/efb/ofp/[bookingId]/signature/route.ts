import { currentAuthUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { efbJson, efbOptions } from "@/lib/efb-performance/http";

export function OPTIONS(request: Request) { return efbOptions(request); }
const canSign = (user: Awaited<ReturnType<typeof currentAuthUser>>) => Boolean(user?.pilot && user.pilot.status === "active" && user.roles.some(({ role }) => role.code === "PILOT" || role.code === "ADMIN"));

async function ownedOfp(bookingId: string, pilotId: string) {
  return prisma.ofpBriefing.findFirst({ where: { flightDispatch: { bookingId, pilotId, dataOrigin: "HISPAFLY_NATIVE", isCurrent: true } }, include: { flightDispatch: true } });
}

export async function GET(request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const user = await currentAuthUser();
  if (!user) return efbJson(request, { error: "unauthorized", message: "HISPAFLY AOC login required." }, 401);
  if (!canSign(user) || !user.pilot) return efbJson(request, { error: "efb_ofp_sign_forbidden", message: "An active HISPAFLY pilot role is required." }, 403);
  const ofp = await ownedOfp((await params).bookingId, user.pilot.id);
  if (!ofp) return efbJson(request, { error: "booking_not_found", message: "This native booking has no accessible OFP." }, 404);
  return efbJson(request, { data: ofp.signatureData ? JSON.parse(ofp.signatureData) : null, updatedAt: ofp.signedAt, contentHash: ofp.contentHash });
}

export async function PUT(request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const user = await currentAuthUser();
  if (!user) return efbJson(request, { error: "unauthorized", message: "HISPAFLY AOC login required." }, 401);
  if (!canSign(user) || !user.pilot) return efbJson(request, { error: "efb_ofp_sign_forbidden", message: "An active HISPAFLY pilot role is required." }, 403);
  const ofp = await ownedOfp((await params).bookingId, user.pilot.id);
  if (!ofp) return efbJson(request, { error: "booking_not_found", message: "This native booking has no accessible OFP." }, 404);
  const body = await request.json().catch(() => null) as { signature?: unknown; contentHash?: string; acceptanceText?: string } | null;
  if (!body?.signature || typeof body.signature !== "object") return efbJson(request, { error: "invalid_signature", message: "A valid OFP signature is required." }, 400);
  if (body.contentHash && body.contentHash !== ofp.contentHash) return efbJson(request, { error: "ofp_changed", message: "The OFP changed; review the current version before signing." }, 409);
  const signatureData = JSON.stringify(body.signature);
  if (signatureData.length > 500_000) return efbJson(request, { error: "signature_too_large", message: "The OFP signature is too large." }, 413);
  const signedAt = new Date();
  await prisma.ofpBriefing.update({ where: { id: ofp.id }, data: { signatureData, signedByPilotId: user.pilot.id, signedByName: user.displayName, signedByCallsign: user.pilot.callsign, acceptanceText: body.acceptanceText?.slice(0, 1000) || "Accepted in HISPAFLY EFB", signedAt, status: "SIGNED" } });
  await writeAuditLogSafely({ action: "EFB_OFP_SIGNED", entityType: "OfpBriefing", entityId: ofp.id, message: "Pilot signed the native OFP in EFB.", metadata: { pilotId: user.pilot.id, bookingId: ofp.flightDispatch.bookingId, contentHash: ofp.contentHash } });
  return efbJson(request, { ok: true, updatedAt: signedAt, contentHash: ofp.contentHash });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const user = await currentAuthUser();
  if (!user) return efbJson(request, { error: "unauthorized" }, 401);
  if (!canSign(user) || !user.pilot) return efbJson(request, { error: "efb_ofp_sign_forbidden" }, 403);
  const ofp = await ownedOfp((await params).bookingId, user.pilot.id);
  if (!ofp) return efbJson(request, { error: "booking_not_found" }, 404);
  if (ofp.flightDispatch.status === "RELEASED") return efbJson(request, { error: "released_signature_locked", message: "A released OFP signature cannot be removed." }, 409);
  await prisma.ofpBriefing.update({ where: { id: ofp.id }, data: { signatureData: null, signedByPilotId: null, signedByName: null, signedByCallsign: null, acceptanceText: null, signedAt: null, status: "GENERATED" } });
  return efbJson(request, { ok: true });
}
