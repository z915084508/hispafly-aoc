import { currentAuthUser } from "@/lib/auth/session";
import { chatBootstrap, isUniqueMessageError, markConversationRead, sendChannelMessage, sendDirectMessage, setChatBlock } from "@/lib/chat/service";

export const dynamic = "force-dynamic";
const staffRoles = new Set(["ADMIN", "STAFF", "OPS"]);

export async function GET(request: Request) {
  const user = await currentAuthUser();
  if (!user?.pilot || user.pilot.status !== "active") return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  return Response.json(await chatBootstrap(user.pilot.id, url.searchParams.get("channelId"), url.searchParams.get("conversationId")), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentAuthUser();
  if (!user?.pilot || user.pilot.status !== "active") return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const roles = new Set(user.roles.map(({ role }) => role.code));
    const isStaff = [...roles].some((role) => staffRoles.has(role));
    switch (body.action) {
      case "send_channel": return Response.json({ ok: true, message: await sendChannelMessage(user.pilot.id, body, isStaff) });
      case "send_direct": return Response.json({ ok: true, ...(await sendDirectMessage(user.pilot.id, body)) });
      case "mark_read": await markConversationRead(user.pilot.id, String(body.conversationId ?? "")); return Response.json({ ok: true });
      case "block": return Response.json({ ok: true, ...(await setChatBlock(user.pilot.id, String(body.pilotId ?? ""), body.blocked !== false)) });
      default: return Response.json({ error: "unsupported_action" }, { status: 400 });
    }
  } catch (error) {
    if (isUniqueMessageError(error)) return Response.json({ ok: true, duplicate: true });
    return Response.json({ error: error instanceof Error ? error.message : "chat_request_failed" }, { status: 400 });
  }
}
