export type CheckLevel="PASS"|"WARNING"|"BLOCK"|"NOT_REQUIRED"|"UNKNOWN";
export function summarizeDispatchChecks(checks:Array<{key:string;status:CheckLevel;critical?:boolean}>){const blocking=checks.filter(x=>x.status==="BLOCK"||(x.status==="UNKNOWN"&&x.critical));const warnings=checks.filter(x=>x.status==="WARNING");return{releasable:blocking.length===0,riskLevel:blocking.length?"BLOCKED":warnings.length?"MEDIUM":"LOW",blockingCount:blocking.length,warningCount:warnings.length}}
export function canChangeReleasedDispatch(status:string){return status!=="RELEASED"}
