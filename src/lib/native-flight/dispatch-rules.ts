export type CheckLevel="PASS"|"WARNING"|"BLOCK"|"NOT_REQUIRED"|"UNKNOWN";
export function summarizeDispatchChecks(checks:Array<{key:string;status:CheckLevel;critical?:boolean}>){const blocking=checks.filter(x=>x.status==="BLOCK"||(x.status==="UNKNOWN"&&x.critical));const warnings=checks.filter(x=>x.status==="WARNING");return{releasable:blocking.length===0,riskLevel:blocking.length?"BLOCKED":warnings.length?"MEDIUM":"LOW",blockingCount:blocking.length,warningCount:warnings.length}}
export function canChangeReleasedDispatch(status:string){return status!=="RELEASED"}
export const NATIVE_DISPATCH_VALIDITY_MS=24*60*60*1000;
export function nativeDispatchExpiresAt(releasedAt:Date){return new Date(releasedAt.getTime()+NATIVE_DISPATCH_VALIDITY_MS)}
export function optionalPerformanceCheck(completed:boolean){return completed?{status:"PASS" as const,detail:"Official performance available."}:{status:"NOT_REQUIRED" as const,detail:"Optional operational calculation."}}
export function isCompletedReleaseState(input:{dispatchStatus:string;bookingStatus?:string|null;flightStatus?:string|null;dispatchedAt?:Date|null}){return input.dispatchStatus==="RELEASED"||Boolean(input.dispatchedAt&&input.bookingStatus==="DISPATCHED"&&input.flightStatus==="DISPATCHED")}
