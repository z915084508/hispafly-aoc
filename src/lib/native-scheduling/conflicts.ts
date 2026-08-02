import { DEFAULT_MIN_TURNAROUND_MINUTES, MINUTES_PER_WEEK } from "./constants.ts";
import { effectivePeriodsOverlap, expandWeeklyWindows, minutesToUtcDate, type WeeklyWindow } from "./time.ts";
import type { ExistingSchedule, ProposedFlightSchedule, ScheduleValidationIssue } from "./types.ts";

const overlap = (a: WeeklyWindow, b: WeeklyWindow) => a.startsAtMinute < b.endsAtMinute && a.endsAtMinute > b.startsAtMinute;
const key = (issue: ScheduleValidationIssue) => [issue.code, issue.conflictingScheduleId, issue.dayOfWeek, issue.details?.availableMinutes].join(":");

export function validateAircraftScheduleConflicts(proposed: ProposedFlightSchedule, route: { departureAirportId: string | null; arrivalAirportId: string | null }, schedules: ExistingSchedule[]): ScheduleValidationIssue[] {
  if (!proposed.assignedAircraftId) return [];
  const relevant = schedules.filter((schedule) => schedule.assignedAircraftId === proposed.assignedAircraftId && schedule.id !== proposed.scheduleId && !["ARCHIVED", "EXPIRED"].includes(schedule.status) && effectivePeriodsOverlap(proposed.effectiveFrom, proposed.effectiveUntil, schedule.effectiveFrom, schedule.effectiveUntil));
  const proposedBase = expandWeeklyWindows({ ...proposed, aircraftId: proposed.assignedAircraftId, departureAirportId: route.departureAirportId, arrivalAirportId: route.arrivalAirportId });
  const proposedCopies = expandWeeklyWindows({ ...proposed, aircraftId: proposed.assignedAircraftId, departureAirportId: route.departureAirportId, arrivalAirportId: route.arrivalAirportId }, [-1, 0, 1]);
  const existingCopies = relevant.flatMap((schedule) => expandWeeklyWindows({ ...schedule, scheduleId: schedule.id, aircraftId: proposed.assignedAircraftId!, departureAirportId: schedule.route.departureAirportId, arrivalAirportId: schedule.route.arrivalAirportId }, [-1, 0, 1]));
  const issues: ScheduleValidationIssue[] = [];

  for (const candidate of proposedBase) for (const conflict of existingCopies) if (overlap(candidate, conflict)) {
    const weekBoundary = conflict.startsAtMinute < 0 || conflict.startsAtMinute >= MINUTES_PER_WEEK || candidate.endsAtMinute > MINUTES_PER_WEEK;
    issues.push({ code: weekBoundary ? "AIRCRAFT_WEEK_BOUNDARY_OVERLAP" : "AIRCRAFT_SCHEDULE_OVERLAP", severity: "ERROR", message: "The assigned aircraft has an overlapping scheduled operation.", scheduleId: proposed.scheduleId, conflictingScheduleId: conflict.scheduleId, routeId: proposed.routeId, aircraftId: proposed.assignedAircraftId, dayOfWeek: candidate.dayOfWeek, startsAt: minutesToUtcDate(candidate.startsAtMinute), endsAt: minutesToUtcDate(candidate.endsAtMinute), details: { proposedStartMinute: candidate.startsAtMinute, proposedEndMinute: candidate.endsAtMinute, conflictingStartMinute: conflict.startsAtMinute, conflictingEndMinute: conflict.endsAtMinute } });
  }

  const timeline = [...proposedCopies.map((window) => ({ ...window, proposed: true })), ...existingCopies.map((window) => ({ ...window, proposed: false }))].sort((a, b) => a.startsAtMinute - b.startsAtMinute || a.endsAtMinute - b.endsAtMinute);
  for (let index = 1; index < timeline.length; index++) {
    const previous = timeline[index - 1], next = timeline[index];
    if (previous.proposed === next.proposed || overlap(previous, next)) continue;
    const proposedWindow = previous.proposed ? previous : next;
    if (proposedWindow.startsAtMinute < 0 || proposedWindow.startsAtMinute >= MINUTES_PER_WEEK) continue;
    const availableMinutes = next.startsAtMinute - previous.endsAtMinute;
    if (availableMinutes < DEFAULT_MIN_TURNAROUND_MINUTES) issues.push({ code: "INSUFFICIENT_TURNAROUND", severity: "ERROR", message: `Only ${availableMinutes} minutes are available between the two flights.`, scheduleId: proposed.scheduleId, conflictingScheduleId: previous.proposed ? next.scheduleId : previous.scheduleId, routeId: proposed.routeId, aircraftId: proposed.assignedAircraftId, dayOfWeek: proposedWindow.dayOfWeek, details: { requiredMinutes: DEFAULT_MIN_TURNAROUND_MINUTES, availableMinutes, previousRouteId: previous.routeId, nextRouteId: next.routeId } });
    if (previous.arrivalAirportId && next.departureAirportId && previous.arrivalAirportId !== next.departureAirportId) issues.push({ code: "AIRCRAFT_LOCATION_DISCONTINUITY", severity: "ERROR", message: "The aircraft cannot continue because the previous arrival airport differs from the next departure airport.", scheduleId: proposed.scheduleId, conflictingScheduleId: previous.proposed ? next.scheduleId : previous.scheduleId, routeId: proposed.routeId, aircraftId: proposed.assignedAircraftId, dayOfWeek: proposedWindow.dayOfWeek, details: { previousArrivalAirportId: previous.arrivalAirportId, nextDepartureAirportId: next.departureAirportId, previousRouteId: previous.routeId, nextRouteId: next.routeId } });
  }
  return [...new Map(issues.map((issue) => [key(issue), issue])).values()].map((issue) => {
    const conflicting = relevant.find((schedule) => schedule.id === issue.conflictingScheduleId);
    return conflicting?.status === "SUSPENDED" ? { ...issue, code: "SUSPENDED_SCHEDULE_CONFLICT", severity: "WARNING" as const, message: "A suspended schedule may conflict if it is restored.", details: { ...issue.details, conflictCode: issue.code } } : issue;
  });
}
