import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const migration = fs.readFileSync("prisma/migrations/20260823110000_acars_community_chat_v1/migration.sql", "utf8");
const route = fs.readFileSync("src/app/api/acars/chat/route.ts", "utf8");
const service = fs.readFileSync("src/lib/chat/service.ts", "utf8");

assert.match(schema, /model ChatChannel/);
assert.match(schema, /model DirectConversation/);
assert.match(schema, /model ChatMessage/);
assert.match(schema, /model ChatBlock/);
assert.match(schema, /model ChatRestriction/);
assert.match(migration, /ChatMessage_one_destination.*channelId.*conversationId/);
assert.match(migration, /chat_announcements/);
assert.match(route, /currentAuthUser\(\)/);
assert.match(route, /user\.pilot\.status !== "active"/);
assert.match(route, /case "send_direct"/);
assert.match(service, /announcementOnly && !isStaff/);
assert.match(service, /SEND_COOLDOWN_MS = 750/);
assert.match(service, /blocked[\s\S]*Direct messages are unavailable/);
assert.match(service, /clientMessageId/);
assert.match(service, /lastReadAAt/);

console.log("ACARS Community chat contract: 15 assertions passed.");
