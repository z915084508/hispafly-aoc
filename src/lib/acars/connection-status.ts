export type LiveConnectionStatus = "ONLINE" | "DELAYED" | "OFFLINE" | "COMPLETED";
export function connectionStatus(lastHeartbeatAt: Date, sessionStatus: string, now = new Date()): LiveConnectionStatus {
  if (sessionStatus === "COMPLETED") return "COMPLETED";
  const age = (now.getTime() - lastHeartbeatAt.getTime()) / 1000;
  return age <= 30 ? "ONLINE" : age <= 120 ? "DELAYED" : "OFFLINE";
}
