import type { Prisma, PrismaClient } from "@prisma/client";

export type ScoringRule = { code:string; label:string; group:string; condition:string; availability:"ACTIVE"|"PLANNED"; category:"OPERATIONAL"|"BONUS"|"INTEGRITY"; action:"ADD"|"DEDUCT"|"REVIEW"|"INVALIDATE"|"NONE"; points:number; enabled:boolean };
export type ScoringPolicy = { id:string; scopeKey:string; name:string; operationalWeight:number; efficiencyWeight:number; startingScore:number; version:number; rules:ScoringRule[] };

export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  {code:"ENGINE_SHUTDOWN",label:"Engines shut down at parking",group:"Engines",condition:"All engines off after block-on",availability:"PLANNED",category:"BONUS",action:"ADD",points:10,enabled:false},
  {code:"ENGINE_START_SEQUENCE",label:"Engine start sequence",group:"Engines",condition:"Configured interval between engine starts",availability:"PLANNED",category:"BONUS",action:"ADD",points:10,enabled:false},
  {code:"ENGINE_WARMUP",label:"Engines not warmed up",group:"Engines · Wear and Tear",condition:"Minimum warm-up time before takeoff",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:30,enabled:false},
  {code:"ENGINE_COOLDOWN",label:"Engines not cooled down",group:"Engines · Wear and Tear",condition:"Minimum cool-down time after landing",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:30,enabled:false},
  {code:"FLAPS_PARKING",label:"Flaps retracted before parking",group:"Flaps",condition:"Flaps up before block-on",availability:"PLANNED",category:"BONUS",action:"ADD",points:10,enabled:false},
  {code:"FLAPS_TAKEOFF",label:"Takeoff flap configuration",group:"Flaps",condition:"Fleet-specific takeoff flap range",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:false},
  {code:"FLAPS_AFTER_LANDING",label:"Flaps handled after landing",group:"Flaps",condition:"No early or missing retraction",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:false},
  {code:"PREPARATION_TIME",label:"Preparation time",group:"Flight Length",condition:"Block-off 20–40 minutes after session start",availability:"PLANNED",category:"BONUS",action:"ADD",points:25,enabled:false},
  {code:"FLIGHT_LENGTH",label:"Completed flight length",group:"Flight Length",condition:"Fleet-specific block-time bands",availability:"PLANNED",category:"BONUS",action:"ADD",points:10,enabled:false},
  {code:"LOW_LANDING_FUEL",label:"Landing with too little fuel",group:"Fuel · Landing",condition:"Landing fuel below fleet threshold",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:50,enabled:false},
  {code:"HIGH_LANDING_FUEL",label:"Landing with excess fuel",group:"Fuel · Landing",condition:"Landing fuel above fleet threshold",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:25,enabled:false},
  {code:"HARD_LANDING",label:"Hard landing",group:"Landing",condition:"ACARS hard-landing event / landing rate",availability:"ACTIVE",category:"OPERATIONAL",action:"DEDUCT",points:15,enabled:true},
  {code:"LANDING_G_BAND",label:"Landing G-force band",group:"Landing",condition:"Fleet-specific G-force ranges",availability:"PLANNED",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:false},
  {code:"DIVERSION",label:"Diversion",group:"Landing",condition:"Landed away from planned destination",availability:"ACTIVE",category:"OPERATIONAL",action:"REVIEW",points:0,enabled:true},
  {code:"TAXI_OVERSPEED",label:"Taxi speed above 30 kt",group:"Operational Safety",condition:"Ground speed above 30 kt while taxiing",availability:"ACTIVE",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:true},
  {code:"OVERSPEED",label:"Speed above 250 kt below FL100",group:"Operational Safety",condition:"No recorded ATC high-speed authorization",availability:"ACTIVE",category:"OPERATIONAL",action:"DEDUCT",points:10,enabled:true},
  {code:"GO_AROUND",label:"Go-around",group:"Operational Safety",condition:"Recorded go-around after established approach",availability:"ACTIVE",category:"OPERATIONAL",action:"NONE",points:0,enabled:true},
  {code:"NETWORK_CONNECTED",label:"Connected to an online network",group:"Network Connectivity",condition:"VATSIM, IVAO or POSCON",availability:"PLANNED",category:"BONUS",action:"ADD",points:20,enabled:false},
  {code:"SHARED_COCKPIT",label:"Shared cockpit",group:"Social",condition:"Verified shared-cockpit session",availability:"PLANNED",category:"BONUS",action:"ADD",points:20,enabled:false},
  {code:"MID_AIR_REFUELING",label:"Mid-air refueling",group:"Flight Integrity",condition:"Material fuel increase while airborne",availability:"PLANNED",category:"INTEGRITY",action:"INVALIDATE",points:0,enabled:false},
  {code:"TIME_ACCELERATION",label:"Time acceleration",group:"Flight Integrity",condition:"Simulator rate above 1×",availability:"ACTIVE",category:"INTEGRITY",action:"REVIEW",points:0,enabled:true},
];

export const mergeScoringRules=(value:unknown):ScoringRule[]=>{const stored=Array.isArray(value)?value.filter((x):x is Partial<ScoringRule>&{code:string}=>Boolean(x&&typeof x==="object"&&"code" in x)):[];return DEFAULT_SCORING_RULES.map(base=>({...base,...stored.find(rule=>rule.code===base.code)}));};
export async function loadScoringPolicy(db:PrismaClient|Prisma.TransactionClient,fleetId?:string|null):Promise<ScoringPolicy>{
  const record=fleetId?await db.pirepScoringPolicy.findFirst({where:{active:true,scopeKey:`FLEET:${fleetId}`}})??await db.pirepScoringPolicy.findFirst({where:{active:true,scopeKey:"GLOBAL"}}):await db.pirepScoringPolicy.findFirst({where:{active:true,scopeKey:"GLOBAL"}});
  if(!record)return{id:"builtin",scopeKey:"GLOBAL",name:"HISPAFLY default",operationalWeight:70,efficiencyWeight:30,startingScore:100,version:1,rules:DEFAULT_SCORING_RULES};
  return{...record,rules:mergeScoringRules(record.rules)};
}

export function calculatePirepScore(policy:ScoringPolicy,eventTypes:string[],efficiencyScore:number|null){
  const counts=new Map<string,number>();eventTypes.forEach(x=>counts.set(x,(counts.get(x)??0)+1));
  const applied=policy.rules.filter(r=>r.enabled&&(counts.get(r.code)??0)>0).map(r=>({...r,count:counts.get(r.code)??0,impact:r.action==="ADD"?r.points*(counts.get(r.code)??0):r.action==="DEDUCT"?-r.points*(counts.get(r.code)??0):0}));
  const operationalScore=Math.max(0,Math.min(100,policy.startingScore+applied.reduce((n,r)=>n+r.impact,0)));
  const ow=Math.max(0,policy.operationalWeight),ew=efficiencyScore==null?0:Math.max(0,policy.efficiencyWeight),weight=ow+ew||1;
  const totalScore=Math.max(0,Math.min(100,Math.round((operationalScore*ow+(efficiencyScore??0)*ew)/weight)));
  return{totalScore,operationalScore,efficiencyScore,requiresReview:applied.some(r=>r.action==="REVIEW"),invalidated:applied.some(r=>r.action==="INVALIDATE"),details:{policyId:policy.id,policyScope:policy.scopeKey,policyName:policy.name,policyVersion:policy.version,weights:{operational:ow,efficiency:ew},operationalScore,efficiencyScore,totalScore,appliedRules:applied} as Prisma.InputJsonValue};
}
