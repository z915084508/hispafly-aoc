import type { PirepRejectCode } from "@prisma/client";
import { PIREP_REJECT_REASONS } from "@/lib/pirep/policy";
import type { PilotRiskSignalInput } from "./types";

export function derivePirepRejectionRiskSignal(args:{pilotId:string;pirepId:string;rejectCode:PirepRejectCode;staffComment?:string|null}):PilotRiskSignalInput|null{
  const severity = args.rejectCode === "R07" ? "CRITICAL" : args.rejectCode === "R08" ? "HIGH" : ["R04","R05"].includes(args.rejectCode) ? "MODERATE" : null;
  if(!severity) return null;
  const category = args.rejectCode === "R07" ? "CONDUCT" : args.rejectCode === "R08" ? "SOP" : "OPERATIONS";
  return {
    pilotId:args.pilotId,
    source:"PIREP",
    category,
    severity,
    signalKey:`pirep:${args.pirepId}:${args.rejectCode}`,
    title:`PIREP rejected · ${args.rejectCode}`,
    reason:PIREP_REJECT_REASONS[args.rejectCode],
    evidence:{pirepId:args.pirepId,rejectCode:args.rejectCode,staffComment:args.staffComment??null},
  };
}
