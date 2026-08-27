import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { applyEventDisposition } from "./event-disposition-service.ts";
import { normalizeOperationalEvents } from "../acars/operational-events.ts";
// This suite must only run against an explicitly isolated test database.
assert.equal(process.env.FOQA_TEST_DATABASE, "1");
const db = new PrismaClient();
const pilot = await db.pilot.create({data:{displayName:"FOQA regression pilot"}});
const staff = await db.staffUser.create({data:{name:"FOQA regression reviewer",email:`foqa-${pilot.id}@example.invalid`}});
let pirepId: string | null = null;
try {
 const pirep=await db.pirep.create({data:{pilotId:pilot.id,status:"manual_review",score:97,scoringDetails:{efficiencyScore:90}}});pirepId=pirep.id;
 const normalized=normalizeOperationalEvents([],[{eventType:"OVERSPEED",timestamp:new Date().toISOString(),episodeId:"test-speed",status:"CONFIRMED",scoreEligible:true,peakValue:267,durationSeconds:60}],"test")[0];
 const event=await db.operationalEvent.create({data:{pirepId:pirep.id,eventType:normalized.eventType,episodeId:normalized.episodeId,timestamp:normalized.timestamp,status:normalized.status,scoreEligible:true,scoreImpact:-4,originalImpact:-4,peakValue:267,durationSeconds:60,metadata:{rawEvidence:"preserve"}}});
 await assert.rejects(db.operationalEvent.create({data:{pirepId:pirep.id,eventType:event.eventType,episodeId:event.episodeId,timestamp:event.timestamp}}),/Unique constraint/);
 await applyEventDisposition(db,{pirepId:pirep.id,eventId:event.id,status:"DISMISSED",reason:"Normalization false positive",staff});
 const dismissed=await db.operationalEvent.findUniqueOrThrow({where:{id:event.id}});
 assert.equal(dismissed.scoreImpact,0);assert.equal(dismissed.originalImpact,-4);assert.deepEqual(dismissed.metadata,{rawEvidence:"preserve"});
 assert.equal((await db.pirep.findUniqueOrThrow({where:{id:pirep.id}})).score,97);
 assert.equal(await db.aocAuditLog.count({where:{entityId:event.id,action:"FOQA_EVENT_DISPOSITION"}}),1);
 await applyEventDisposition(db,{pirepId:pirep.id,eventId:event.id,status:"CONFIRMED",reason:"Evidence rechecked",staff});
 assert.equal((await db.pirep.findUniqueOrThrow({where:{id:pirep.id}})).score,94);
 assert.equal((await db.operationalEvent.findUniqueOrThrow({where:{id:event.id}})).scoreImpact,-4);
 await assert.rejects(applyEventDisposition(db,{pirepId:pirep.id,eventId:event.id,status:"INVALID",reason:"Test",staff}));
 assert.equal(await db.aocAuditLog.count({where:{entityId:event.id,action:"FOQA_EVENT_DISPOSITION"}}),2);
 console.log("FOQA database uniqueness, disposition, score recalculation and audit tests passed");
} finally {
 await db.aocAuditLog.deleteMany({where:{staffUserId:staff.id}});
 if(pirepId) await db.pirep.delete({where:{id:pirepId}});
 await db.staffUser.delete({where:{id:staff.id}});await db.pilot.delete({where:{id:pilot.id}});await db.$disconnect();
}
