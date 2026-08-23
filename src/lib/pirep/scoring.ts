import type { Prisma, PrismaClient } from "@prisma/client";

export type ScoringRule = { code:string; label:string; category:"OPERATIONAL"|"BONUS"|"INTEGRITY"; action:"ADD"|"DEDUCT"|"REVIEW"|"INVALIDATE"|"NONE"; points:number; enabled:boolean };
export type ScoringPolicy = { id:string; scopeKey:string; name:string; operationalWeight:number; efficiencyWeight:number; startingScore:number; version:number; rules:ScoringRule[] };

export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  {code:"TAXI_OVERSPEED",label:"Taxi speed above 30 kt",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:true},
  {code:"OVERSPEED",label:"Speed above 250 kt below FL100",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:true},
  {code:"HARD_LANDING",label:"Hard landing",category:"OPERATIONAL",action:"DEDUCT",points:15,enabled:true},
  {code:"GO_AROUND",label:"Go-around",category:"OPERATIONAL",action:"NONE",points:0,enabled:true},
  {code:"MID_AIR_REFUELING",label:"Mid-air refueling",category:"INTEGRITY",action:"INVALIDATE",points:0,enabled:true},
  {code:"TIME_ACCELERATION",label:"Time acceleration",category:"INTEGRITY",action:"REVIEW",points:0,enabled:true},
];

const parseRules=(value:unknown):ScoringRule[]=>Array.isArray(value)?value.filter((x):x is ScoringRule=>Boolean(x&&typeof x==="object"&&"code" in x&&"action" in x)):DEFAULT_SCORING_RULES;
export async function loadScoringPolicy(db:PrismaClient|Prisma.TransactionClient,fleetId?:string|null):Promise<ScoringPolicy>{
  const record=fleetId?await db.pirepScoringPolicy.findFirst({where:{active:true,scopeKey:`FLEET:${fleetId}`}})??await db.pirepScoringPolicy.findFirst({where:{active:true,scopeKey:"GLOBAL"}}):await db.pirepScoringPolicy.findFirst({where:{active:true,scopeKey:"GLOBAL"}});
  if(!record)return{id:"builtin",scopeKey:"GLOBAL",name:"HISPAFLY default",operationalWeight:70,efficiencyWeight:30,startingScore:100,version:1,rules:DEFAULT_SCORING_RULES};
  return{...record,rules:parseRules(record.rules)};
}

export function calculatePirepScore(policy:ScoringPolicy,eventTypes:string[],efficiencyScore:number|null){
  const counts=new Map<string,number>();eventTypes.forEach(x=>counts.set(x,(counts.get(x)??0)+1));
  const applied=policy.rules.filter(r=>r.enabled&&(counts.get(r.code)??0)>0).map(r=>({...r,count:counts.get(r.code)??0,impact:r.action==="ADD"?r.points*(counts.get(r.code)??0):r.action==="DEDUCT"?-r.points*(counts.get(r.code)??0):0}));
  const operationalScore=Math.max(0,Math.min(100,policy.startingScore+applied.reduce((n,r)=>n+r.impact,0)));
  const ow=Math.max(0,policy.operationalWeight),ew=efficiencyScore==null?0:Math.max(0,policy.efficiencyWeight),weight=ow+ew||1;
  const totalScore=Math.max(0,Math.min(100,Math.round((operationalScore*ow+(efficiencyScore??0)*ew)/weight)));
  return{totalScore,operationalScore,efficiencyScore,requiresReview:applied.some(r=>r.action==="REVIEW"),invalidated:applied.some(r=>r.action==="INVALIDATE"),details:{policyId:policy.id,policyScope:policy.scopeKey,policyName:policy.name,policyVersion:policy.version,weights:{operational:ow,efficiency:ew},operationalScore,efficiencyScore,totalScore,appliedRules:applied} as Prisma.InputJsonValue};
}
