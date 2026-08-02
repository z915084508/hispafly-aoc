import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import {
  previewSchedulePublication,
  publishFlightSchedule,
  SchedulePublicationError,
  type PublicationPreview,
} from "./publication";

export const BULK_PUBLICATION_LIMIT = 50;
const PREVIEW_CONCURRENCY = 5;
const DAY = 86_400_000;

const queueInclude = {
  route: true,
  defaultFleet: true,
  assignedAircraft: { include: { currentAirport: true } },
} as const;

type QueueSchedule = Prisma.FlightScheduleGetPayload<{ include: typeof queueInclude }>;

export type DraftPublicationQueueItem = {
  schedule: QueueSchedule;
  preview: PublicationPreview | null;
  previewError: { code: string; message: string } | null;
};

export type DraftPublicationQueue = {
  items: DraftPublicationQueueItem[];
  total: number;
  limit: number;
  truncated: boolean;
};

export type BatchPublicationMode = "READY_ONLY" | "SELECTED";
export type BatchPublicationItemStatus =
  | "PUBLISHED"
  | "ALREADY_PUBLISHED"
  | "BLOCKED"
  | "WARNING_REQUIRED"
  | "FAILED"
  | "NOT_FOUND";

export type BatchPublicationItem = {
  scheduleId: string;
  code: string;
  status: BatchPublicationItemStatus;
  errorCode?: string;
  message?: string;
  created?: number;
  existing?: number;
};

export type BatchPublicationResult = {
  requested: number;
  published: number;
  alreadyPublished: number;
  failed: number;
  createdFlights: number;
  existingFlights: number;
  items: BatchPublicationItem[];
};

const safeMessage = (error: unknown) =>
  error instanceof SchedulePublicationError
    ? { code: error.code, message: error.message }
    : { code: "PUBLICATION_FAILED", message: "No se pudo publicar la programación seleccionada." };

const parseWeek = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
};

export async function listDraftPublicationQueue(input: {
  search?: string;
  aircraftId?: string;
  fleetId?: string;
  week?: string;
  now?: Date;
} = {}): Promise<DraftPublicationQueue> {
  const conditions: Prisma.FlightScheduleWhereInput[] = [];
  const search = input.search?.trim();
  if (search) {
    conditions.push({
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { route: { flightNumber: { contains: search, mode: "insensitive" } } },
        { route: { routeCode: { contains: search, mode: "insensitive" } } },
        { route: { departure: { contains: search.toUpperCase() } } },
        { route: { arrival: { contains: search.toUpperCase() } } },
      ],
    });
  }
  const weekStart = parseWeek(input.week);
  if (weekStart) {
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY - 1);
    conditions.push({
      effectiveFrom: { lte: weekEnd },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: weekStart } }],
    });
  }

  const where: Prisma.FlightScheduleWhereInput = {
    status: "DRAFT",
    ...(input.aircraftId ? { assignedAircraftId: input.aircraftId } : {}),
    ...(input.fleetId ? { defaultFleetId: input.fleetId } : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.flightSchedule.findMany({
      where,
      include: queueInclude,
      orderBy: [
        { assignedAircraftId: "asc" },
        { effectiveFrom: "asc" },
        { departureTimeMinutesUtc: "asc" },
        { code: "asc" },
      ],
      take: BULK_PUBLICATION_LIMIT,
    }),
    prisma.flightSchedule.count({ where }),
  ]);

  const items: DraftPublicationQueueItem[] = [];
  const now = input.now ?? new Date();
  for (let index = 0; index < rows.length; index += PREVIEW_CONCURRENCY) {
    const chunk = rows.slice(index, index + PREVIEW_CONCURRENCY);
    const previews = await Promise.all(chunk.map(async (schedule) => {
      try {
        return {
          schedule,
          preview: await previewSchedulePublication(schedule.id, now),
          previewError: null,
        } satisfies DraftPublicationQueueItem;
      } catch (error) {
        const failure = safeMessage(error);
        return {
          schedule,
          preview: null,
          previewError: failure,
        } satisfies DraftPublicationQueueItem;
      }
    }));
    items.push(...previews);
  }

  return { items, total, limit: BULK_PUBLICATION_LIMIT, truncated: total > BULK_PUBLICATION_LIMIT };
}

export async function publishFlightSchedulesBatch(input: {
  scheduleIds: string[];
  mode: BatchPublicationMode;
  acknowledgeWarnings: boolean;
  warningFingerprints: Record<string, string | undefined>;
  actor: StaffIdentity;
  now?: Date;
}): Promise<BatchPublicationResult> {
  const scheduleIds = [...new Set(input.scheduleIds.map((id) => id.trim()).filter(Boolean))];
  if (!scheduleIds.length) throw new SchedulePublicationError("NO_SCHEDULES_SELECTED", "Selecciona al menos una programación.");
  if (scheduleIds.length > BULK_PUBLICATION_LIMIT) throw new SchedulePublicationError("BATCH_LIMIT_EXCEEDED", `Solo se pueden publicar ${BULK_PUBLICATION_LIMIT} programaciones por operación.`);

  const schedules = await prisma.flightSchedule.findMany({
    where: { id: { in: scheduleIds } },
    select: {
      id: true,
      code: true,
      status: true,
      assignedAircraftId: true,
      effectiveFrom: true,
      departureTimeMinutesUtc: true,
    },
  });
  schedules.sort((left, right) =>
    (left.assignedAircraftId ?? "").localeCompare(right.assignedAircraftId ?? "")
    || left.effectiveFrom.getTime() - right.effectiveFrom.getTime()
    || left.departureTimeMinutesUtc - right.departureTimeMinutesUtc
    || left.code.localeCompare(right.code));

  const items: BatchPublicationItem[] = [];
  const found = new Set(schedules.map(({ id }) => id));
  for (const scheduleId of scheduleIds.filter((id) => !found.has(id))) {
    items.push({ scheduleId, code: scheduleId, status: "NOT_FOUND", errorCode: "SCHEDULE_NOT_FOUND", message: "La programación no existe." });
  }

  for (const schedule of schedules) {
    try {
      if (schedule.status !== "DRAFT" && schedule.status !== "ACTIVE") {
        items.push({ scheduleId: schedule.id, code: schedule.code, status: "BLOCKED", errorCode: "SCHEDULE_NOT_DRAFT", message: "Solo se pueden publicar programaciones DRAFT." });
        continue;
      }

      const preview = await previewSchedulePublication(schedule.id, input.now);
      if (preview.blockingIssues.length) {
        items.push({
          scheduleId: schedule.id,
          code: schedule.code,
          status: "BLOCKED",
          errorCode: preview.blockingIssues[0].code,
          message: preview.blockingIssues.map(({ message }) => message).join(" "),
        });
        continue;
      }
      if (input.mode === "READY_ONLY" && preview.warnings.length) {
        items.push({
          scheduleId: schedule.id,
          code: schedule.code,
          status: "WARNING_REQUIRED",
          errorCode: "WARNING_ACKNOWLEDGEMENT_REQUIRED",
          message: "La programación tiene advertencias y requiere confirmación explícita.",
        });
        continue;
      }
      if (preview.warnings.length && (!input.acknowledgeWarnings || input.warningFingerprints[schedule.id] !== preview.warningFingerprint)) {
        items.push({
          scheduleId: schedule.id,
          code: schedule.code,
          status: "WARNING_REQUIRED",
          errorCode: "WARNING_ACKNOWLEDGEMENT_REQUIRED",
          message: "Las advertencias deben revisarse de nuevo antes de publicar.",
        });
        continue;
      }

      const result = await publishFlightSchedule({
        scheduleId: schedule.id,
        warningFingerprint: preview.warnings.length ? preview.warningFingerprint : undefined,
        actor: input.actor,
        now: input.now,
      });
      items.push({
        scheduleId: schedule.id,
        code: schedule.code,
        status: result.alreadyPublished ? "ALREADY_PUBLISHED" : "PUBLISHED",
        created: result.generation.created,
        existing: result.generation.existing,
      });
    } catch (error) {
      const failure = safeMessage(error);
      items.push({ scheduleId: schedule.id, code: schedule.code, status: "FAILED", errorCode: failure.code, message: failure.message });
    }
  }

  return items.reduce<BatchPublicationResult>((result, item) => {
    result.items.push(item);
    if (item.status === "PUBLISHED") result.published += 1;
    else if (item.status === "ALREADY_PUBLISHED") result.alreadyPublished += 1;
    else result.failed += 1;
    result.createdFlights += item.created ?? 0;
    result.existingFlights += item.existing ?? 0;
    return result;
  }, { requested: scheduleIds.length, published: 0, alreadyPublished: 0, failed: 0, createdFlights: 0, existingFlights: 0, items: [] });
}
