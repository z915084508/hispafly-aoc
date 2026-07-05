export type AircraftCategory = "NARROWBODY" | "WIDEBODY" | "SUPER_HEAVY";
export function aircraftCategory(type?: string | null): AircraftCategory { const t=(type??"").toUpperCase(); if(t==="A388") return "SUPER_HEAVY"; if(["B772","A359"].includes(t)) return "WIDEBODY"; return "NARROWBODY"; }
const wearRules={NARROWBODY:{cycle:.30,hourly:.08},WIDEBODY:{cycle:.45,hourly:.10},SUPER_HEAVY:{cycle:.60,hourly:.12}};
export function calculateAircraftWear(p:{aircraftType?:string|null;blockMinutes?:number|null;landingRate?:number|null;landingG?:number|null;pirepStatus:string;points?:number|null}) {
 if(p.pirepStatus!=="accepted") return {wearPercent:0,hardLanding:false,factors:{ignored:true}};
 const category=aircraftCategory(p.aircraftType), rule=wearRules[category], rate=p.landingRate??0, g=p.landingG??0;
 const landingPenalty=rate>=-300?0:rate>=-450?.25:rate>=-600?.75:2.5; const gPenalty=g<=1.6?0:g<=1.9?.4:1.2;
 const hourlyWear=((p.blockMinutes??0)/60)*rule.hourly; const wearPercent=Math.round((rule.cycle+hourlyWear+landingPenalty+gPenalty)*100)/100;
 return {wearPercent,hardLanding:rate < -600,factors:{category,cycleWear:rule.cycle,hourlyWear,landingPenalty,gPenalty,points:p.points??null}};
}
export function statusForCondition(value:number){return value>=80?"NORMAL":value>=60?"WATCH":value>=40?"CAUTION":value>=30?"MAINT_REQUIRED":value>=20?"FERRY_ONLY":"AOG" as const;}
const costs={NARROWBODY:{base:1_500_000,point:120_000,day:200_000,damage:1_000_000},WIDEBODY:{base:3_500_000,point:350_000,day:500_000,damage:2_500_000},SUPER_HEAVY:{base:5_500_000,point:550_000,day:800_000,damage:4_000_000}};
export function calculateMaintenanceCost(p:{aircraftType?:string|null;currentCondition:number;targetCondition:number;maintenanceType:"LINE_CHECK"|"SCHEDULED_CHECK"|"HEAVY_CHECK"|"AOG_RECOVERY";hardLandingFlag?:boolean;aogRecovery?:boolean}){const c=costs[aircraftCategory(p.aircraftType)],days={LINE_CHECK:1,SCHEDULED_CHECK:2,HEAVY_CHECK:3,AOG_RECOVERY:5}[p.maintenanceType];let total=c.base+Math.max(0,p.targetCondition-p.currentCondition)*c.point+days*c.day+(p.hardLandingFlag?c.damage:0);if(p.aogRecovery)total*=1.5;return Math.round(total);}
