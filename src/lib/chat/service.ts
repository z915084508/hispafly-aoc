import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const MAX_MESSAGE_LENGTH = 1000, ONLINE_WINDOW_MS = 90_000, SEND_COOLDOWN_MS = 750;
const pilotView = { id: true, callsign: true, displayName: true, rankName: true } as const;
const participantKey = (a: string, b: string) => [a, b].sort().join(":");

function cleanBody(value: unknown) { const body = typeof value === "string" ? value.trim() : ""; if (!body || body.length > MAX_MESSAGE_LENGTH) throw new Error(`Message must contain 1-${MAX_MESSAGE_LENGTH} characters.`); return body; }
async function assertCanSend(pilotId: string) {
  const [restriction, latest] = await Promise.all([prisma.chatRestriction.findUnique({ where: { pilotId } }), prisma.chatMessage.findFirst({ where: { senderPilotId: pilotId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })]);
  if (restriction?.bannedAt) throw new Error("Chat access is suspended.");
  if (restriction?.mutedUntil && restriction.mutedUntil > new Date()) throw new Error(`Chat is muted until ${restriction.mutedUntil.toISOString()}.`);
  if (latest && Date.now() - latest.createdAt.getTime() < SEND_COOLDOWN_MS) throw new Error("Please wait before sending another message.");
}

export async function chatBootstrap(pilotId: string, channelId?: string | null, conversationId?: string | null) {
  const now = new Date();
  await prisma.chatPresence.upsert({ where: { pilotId }, create: { pilotId, lastSeenAt: now }, update: { status: "ONLINE", lastSeenAt: now } });
  const [channels, conversations, online, pilots, blocks] = await Promise.all([
    prisma.chatChannel.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.directConversation.findMany({ where: { OR: [{ participantAId: pilotId }, { participantBId: pilotId }] }, orderBy: { lastMessageAt: "desc" }, take: 50, include: { participantA: { select: pilotView }, participantB: { select: pilotView }, messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: pilotView } } } } }),
    prisma.chatPresence.findMany({ where: { lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) }, pilot: { status: "active" } }, orderBy: { lastSeenAt: "desc" }, take: 100, include: { pilot: { select: pilotView } } }),
    prisma.pilot.findMany({ where: { status: "active", id: { not: pilotId } }, select: pilotView, orderBy: { displayName: "asc" }, take: 200 }),
    prisma.chatBlock.findMany({ where: { blockerPilotId: pilotId }, select: { blockedPilotId: true } }),
  ]);
  const selectedChannelId = channelId && channels.some((item) => item.id === channelId) ? channelId : channels.find((item) => item.slug === "general")?.id;
  const selectedConversation = conversationId ? conversations.find((item) => item.id === conversationId) : null;
  const messages = selectedConversation ? await prisma.chatMessage.findMany({ where: { conversationId: selectedConversation.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100, include: { sender: { select: pilotView } } }) : selectedChannelId ? await prisma.chatMessage.findMany({ where: { channelId: selectedChannelId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100, include: { sender: { select: pilotView } } }) : [];
  return { updatedAt: now, currentPilotId: pilotId, channels, conversations: conversations.map((item) => { const other = item.participantAId === pilotId ? item.participantB : item.participantA; const lastReadAt = item.participantAId === pilotId ? item.lastReadAAt : item.lastReadBAt; return { id: item.id, other, lastMessage: item.messages[0] ?? null, lastMessageAt: item.lastMessageAt, unread: Boolean(item.messages[0] && item.messages[0].senderPilotId !== pilotId && (!lastReadAt || item.messages[0].createdAt > lastReadAt)) }; }), online: online.map((item) => ({ ...item.pilot, status: item.status, lastSeenAt: item.lastSeenAt })), pilots, blockedPilotIds: blocks.map((item) => item.blockedPilotId), messages: messages.reverse() };
}

export async function sendChannelMessage(pilotId: string, input: { channelId?: unknown; body?: unknown; clientMessageId?: unknown }, isStaff: boolean) {
  await assertCanSend(pilotId); const channelId = typeof input.channelId === "string" ? input.channelId : ""; const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, enabled: true } });
  if (!channel) throw new Error("Channel not found."); if (channel.announcementOnly && !isStaff) throw new Error("Only Staff may post announcements.");
  return prisma.chatMessage.create({ data: { channelId, senderPilotId: pilotId, body: cleanBody(input.body), clientMessageId: String(input.clientMessageId || randomUUID()) } });
}

export async function sendDirectMessage(pilotId: string, input: { recipientPilotId?: unknown; body?: unknown; clientMessageId?: unknown }) {
  await assertCanSend(pilotId); const recipientPilotId = typeof input.recipientPilotId === "string" ? input.recipientPilotId : ""; if (!recipientPilotId || recipientPilotId === pilotId) throw new Error("Invalid recipient.");
  const [recipient, blocked] = await Promise.all([prisma.pilot.findFirst({ where: { id: recipientPilotId, status: "active" }, select: { id: true } }), prisma.chatBlock.findFirst({ where: { OR: [{ blockerPilotId: pilotId, blockedPilotId: recipientPilotId }, { blockerPilotId: recipientPilotId, blockedPilotId: pilotId }] } })]);
  if (!recipient) throw new Error("Pilot not found."); if (blocked) throw new Error("Direct messages are unavailable for this pilot."); const key = participantKey(pilotId, recipientPilotId); const [a, b] = [pilotId, recipientPilotId].sort();
  return prisma.$transaction(async (tx) => { const conversation = await tx.directConversation.upsert({ where: { participantKey: key }, create: { participantKey: key, participantAId: a, participantBId: b }, update: { lastMessageAt: new Date() } }); const message = await tx.chatMessage.create({ data: { conversationId: conversation.id, senderPilotId: pilotId, body: cleanBody(input.body), clientMessageId: String(input.clientMessageId || randomUUID()) } }); return { conversationId: conversation.id, message }; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function markConversationRead(pilotId: string, conversationId: string) { const conversation = await prisma.directConversation.findFirst({ where: { id: conversationId, OR: [{ participantAId: pilotId }, { participantBId: pilotId }] } }); if (!conversation) throw new Error("Conversation not found."); return prisma.directConversation.update({ where: { id: conversation.id }, data: conversation.participantAId === pilotId ? { lastReadAAt: new Date() } : { lastReadBAt: new Date() } }); }
export async function setChatBlock(pilotId: string, blockedPilotId: string, blocked: boolean) { if (!blockedPilotId || blockedPilotId === pilotId) throw new Error("Invalid pilot."); if (blocked) await prisma.chatBlock.upsert({ where: { blockerPilotId_blockedPilotId: { blockerPilotId: pilotId, blockedPilotId } }, create: { blockerPilotId: pilotId, blockedPilotId }, update: {} }); else await prisma.chatBlock.deleteMany({ where: { blockerPilotId: pilotId, blockedPilotId } }); return { blocked }; }
export function isUniqueMessageError(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
