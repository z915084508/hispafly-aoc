export type PilotRiskSource = "TREND" | "FOQA" | "PIREP" | "ASSESSMENT" | "RELIABILITY" | "TRAINING" | "RECURRENT_CHECK" | "STAFF";
export type PilotRiskCategory = "SAFETY" | "SOP" | "OPERATIONS" | "RELIABILITY" | "COMMAND" | "APPROACH_STABILITY" | "LANDING_TECHNIQUE" | "CONDUCT" | "OTHER";
export type PilotRiskSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type PilotRiskStatus = "OPEN" | "CONFIRMED" | "DISMISSED" | "RESOLVED";

export type PilotRiskSignalInput = {
  pilotId: string;
  source: PilotRiskSource;
  category: PilotRiskCategory;
  severity: PilotRiskSeverity;
  signalKey: string;
  title: string;
  reason: string;
  evidence?: Record<string, unknown>;
  detectedAt?: Date;
};

export type PilotRiskFlagRecord = PilotRiskSignalInput & {
  id: string;
  status: PilotRiskStatus;
  detectedAt: Date;
  lastDetectedAt: Date;
  occurrenceCount: number;
  confirmedAt: Date | null;
  confirmedByStaffId: string | null;
  dismissedAt: Date | null;
  dismissedByStaffId: string | null;
  resolvedAt: Date | null;
  resolvedByStaffId: string | null;
  resolutionComment: string | null;
  createdAt: Date;
  updatedAt: Date;
};
