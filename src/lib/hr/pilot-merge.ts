import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function previewPilotMerge(sourceId:string,targetId:string){
  if(!sourceId||!targetId||sourceId===targetId)throw new Error("Select two different Pilot records.");
  const select={id:true,displayName:true,callsign:true,email:true,authUserId:true,vamsysPilotId:true,vamsysUserId:true,walletBalanceCents:true,_count:{select:{pireps:true,payrollRecords:true,walletTransactions:true,flightDispatches:true,pilotBookings:true,efbPerformanceCalculations:true}}} as const;
  const [source,target]=await Promise.all([prisma.pilot.findUnique({where:{id:sourceId},select}),prisma.pilot.findUnique({where:{id:targetId},select})]);
  if(!source||!target)throw new Error("Pilot record not found.");
  return {source,target,warnings:[source.authUserId?"Source has a local login; its sessions will be revoked and the identity removed.":null,target.authUserId?null:"Target has no local login.",source.callsign&&target.callsign&&source.callsign!==target.callsign?"Callsign conflict: target callsign will be retained.":null].filter(Boolean)};
}

export async function mergePilotRecords(sourceId:string,targetId:string,staffUserId:string){
  await previewPilotMerge(sourceId,targetId);
  return prisma.$transaction(async tx=>{
    const [source,target]=await Promise.all([tx.pilot.findUniqueOrThrow({where:{id:sourceId}}),tx.pilot.findUniqueOrThrow({where:{id:targetId}})]);
    const moved={
      pireps:(await tx.pirep.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      payroll:(await tx.payrollRecord.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      wallet:(await tx.walletTransaction.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      notes:(await tx.pilotNote.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      dispatches:(await tx.flightDispatch.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      offers:(await tx.flightOffer.updateMany({where:{createdByPilotId:sourceId},data:{createdByPilotId:targetId}})).count,
      bookings:(await tx.pilotBooking.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      performance:(await tx.efbPerformanceCalculation.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
      readiness:(await tx.efbDepartureReadiness.updateMany({where:{pilotId:sourceId},data:{pilotId:targetId}})).count,
    };
    const [sourceNavigraph,targetNavigraph]=await Promise.all([tx.navigraphOAuthToken.findUnique({where:{pilotId:sourceId}}),tx.navigraphOAuthToken.findUnique({where:{pilotId:targetId}})]);
    if(sourceNavigraph&&!targetNavigraph)await tx.navigraphOAuthToken.update({where:{pilotId:sourceId},data:{pilotId:targetId}});
    else if(sourceNavigraph)await tx.navigraphOAuthToken.delete({where:{pilotId:sourceId}});
    const [sourceVamsys,targetVamsys]=await Promise.all([tx.vamsysOAuthToken.findUnique({where:{pilotId:sourceId}}),tx.vamsysOAuthToken.findUnique({where:{pilotId:targetId}})]);
    if(sourceVamsys&&!targetVamsys)await tx.vamsysOAuthToken.update({where:{pilotId:sourceId},data:{pilotId:targetId}});
    else if(sourceVamsys)await tx.vamsysOAuthToken.delete({where:{pilotId:sourceId}});
    if(source.authUserId){
      await tx.authSession.updateMany({where:{userId:source.authUserId,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.pilot.update({where:{id:sourceId},data:{authUserId:null}});
      await tx.authUser.delete({where:{id:source.authUserId}});
    }
    await tx.pilot.update({where:{id:sourceId},data:{vamsysPilotId:null,vamsysUserId:null,email:null,callsign:null}});
    await tx.pilot.update({where:{id:targetId},data:{
      vamsysPilotId:target.vamsysPilotId??source.vamsysPilotId,vamsysUserId:target.vamsysUserId??source.vamsysUserId,
      vatsimId:target.vatsimId??source.vatsimId,ivaoId:target.ivaoId??source.ivaoId,discordId:target.discordId??source.discordId,
      simbriefUserId:target.simbriefUserId??source.simbriefUserId,rankName:target.rankName??source.rankName,rankAbbreviation:target.rankAbbreviation??source.rankAbbreviation,
      hubId:target.hubId??source.hubId,rank:target.rank??source.rank,base:target.base??source.base,
      walletBalanceCents:Math.max(target.walletBalanceCents,source.walletBalanceCents),
      lastPirepSyncAt:target.lastPirepSyncAt??source.lastPirepSyncAt,lastOperationsSyncAt:target.lastOperationsSyncAt??source.lastOperationsSyncAt,
      ...((target.operationsRawData??source.operationsRawData)!==null?{operationsRawData:(target.operationsRawData??source.operationsRawData) as Prisma.InputJsonValue}:{}),
    }});
    await tx.pilot.delete({where:{id:sourceId}});
    await tx.aocAuditLog.create({data:{staffUserId,action:"PILOT_ACCOUNTS_MERGED",entityType:"Pilot",entityId:targetId,message:`Merged ${source.displayName} into ${target.displayName}.`,metadata:{sourceId,targetId,moved} as Prisma.InputJsonValue}});
    return moved;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
