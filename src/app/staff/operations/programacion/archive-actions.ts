"use server";

import { revalidatePath } from "next/cache";
import { archiveFlightScheduleDraft } from "@/lib/native-scheduling/management";
import { BULK_PUBLICATION_LIMIT } from "@/lib/native-scheduling/bulk-publication";
import { requireStaffPermission } from "@/lib/staff/authorization";

export type ProgramacionArchiveItem = {
  scheduleId: string;
  code?: string;
  archived: boolean;
  message?: string;
};

export type ProgramacionArchiveResult = {
  requested: number;
  archived: number;
  failed: number;
  items: ProgramacionArchiveItem[];
};

const safeMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo archivar la programación.";

export async function archiveProgramacionDraftsAction(
  requestedIds: string[],
): Promise<ProgramacionArchiveResult> {
  const scheduleIds = [...new Set(requestedIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!scheduleIds.length) throw new Error("Selecciona al menos una programación para archivar.");
  if (scheduleIds.length > BULK_PUBLICATION_LIMIT) {
    throw new Error(`Solo se pueden archivar ${BULK_PUBLICATION_LIMIT} programaciones por operación.`);
  }

  const staff = await requireStaffPermission("SCHEDULE_STATUS_MANAGE", {
    entityType: "FlightSchedule",
    attemptedAction: "bulk archive Programación drafts",
  });

  const items: ProgramacionArchiveItem[] = [];
  for (const scheduleId of scheduleIds) {
    try {
      const schedule = await archiveFlightScheduleDraft(scheduleId, staff);
      items.push({ scheduleId, code: schedule.code, archived: true });
    } catch (error) {
      items.push({ scheduleId, archived: false, message: safeMessage(error) });
    }
  }

  revalidatePath("/staff/operations/programacion");

  const archived = items.filter((item) => item.archived).length;
  return {
    requested: scheduleIds.length,
    archived,
    failed: scheduleIds.length - archived,
    items,
  };
}
