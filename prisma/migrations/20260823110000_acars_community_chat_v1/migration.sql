CREATE TABLE "ChatChannel" ("id" TEXT NOT NULL,"slug" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT,"announcementOnly" BOOLEAN NOT NULL DEFAULT false,"enabled" BOOLEAN NOT NULL DEFAULT true,"sortOrder" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatChannel_slug_key" ON "ChatChannel"("slug");

CREATE TABLE "DirectConversation" ("id" TEXT NOT NULL,"participantKey" TEXT NOT NULL,"participantAId" TEXT NOT NULL,"participantBId" TEXT NOT NULL,"lastReadAAt" TIMESTAMP(3),"lastReadBAt" TIMESTAMP(3),"lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectConversation_participantKey_key" ON "DirectConversation"("participantKey");
CREATE INDEX "DirectConversation_participantAId_lastMessageAt_idx" ON "DirectConversation"("participantAId","lastMessageAt");
CREATE INDEX "DirectConversation_participantBId_lastMessageAt_idx" ON "DirectConversation"("participantBId","lastMessageAt");

CREATE TABLE "ChatMessage" ("id" TEXT NOT NULL,"channelId" TEXT,"conversationId" TEXT,"senderPilotId" TEXT NOT NULL,"clientMessageId" TEXT NOT NULL,"body" TEXT NOT NULL,"editedAt" TIMESTAMP(3),"deletedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatMessage_clientMessageId_key" ON "ChatMessage"("clientMessageId");
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId","createdAt");
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId","createdAt");
CREATE INDEX "ChatMessage_senderPilotId_createdAt_idx" ON "ChatMessage"("senderPilotId","createdAt");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_one_destination" CHECK (("channelId" IS NOT NULL)::int + ("conversationId" IS NOT NULL)::int = 1);

CREATE TABLE "ChatPresence" ("pilotId" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'ONLINE',"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "ChatPresence_pkey" PRIMARY KEY ("pilotId"));
CREATE INDEX "ChatPresence_lastSeenAt_idx" ON "ChatPresence"("lastSeenAt");

CREATE TABLE "ChatBlock" ("id" TEXT NOT NULL,"blockerPilotId" TEXT NOT NULL,"blockedPilotId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatBlock_blockerPilotId_blockedPilotId_key" ON "ChatBlock"("blockerPilotId","blockedPilotId");

CREATE TABLE "ChatRestriction" ("pilotId" TEXT NOT NULL,"mutedUntil" TIMESTAMP(3),"bannedAt" TIMESTAMP(3),"reason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "ChatRestriction_pkey" PRIMARY KEY ("pilotId"));

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderPilotId_fkey" FOREIGN KEY ("senderPilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatPresence" ADD CONSTRAINT "ChatPresence_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockerPilotId_fkey" FOREIGN KEY ("blockerPilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockedPilotId_fkey" FOREIGN KEY ("blockedPilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRestriction" ADD CONSTRAINT "ChatRestriction_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ChatChannel" ("id","slug","name","description","announcementOnly","sortOrder","updatedAt") VALUES
('chat_general','general','General','HISPAFLY community chat',false,10,CURRENT_TIMESTAMP),
('chat_operations','operations','Operations','Flight operations discussion',false,20,CURRENT_TIMESTAMP),
('chat_support','support','Support','ACARS and pilot support',false,30,CURRENT_TIMESTAMP),
('chat_announcements','announcements','Announcements','Official HISPAFLY announcements',true,0,CURRENT_TIMESTAMP);
