import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const service = read("./bulk-publication.ts");
const workspace = read("../../app/staff/operations/programacion/page.tsx");
const queue = read("../../components/programacion/publication-queue.tsx");
const actions = read("../../app/staff/operations/programacion/actions.ts");
const archiveActions = read("../../app/staff/operations/programacion/archive-actions.ts");
const management = read("./management.ts");
const publication = read("./publication.ts");

assert.match(service, /BULK_PUBLICATION_LIMIT = 50/);
assert.match(service, /status: "DRAFT"/);
assert.match(service, /previewSchedulePublication/);
assert.match(service, /publishFlightSchedule/);
assert.match(service, /for \(const schedule of schedules\)/);
assert.doesNotMatch(service, /prisma\.\$transaction/);
assert.match(service, /READY_ONLY/);
assert.match(service, /SELECTED/);
assert.match(service, /warningFingerprints\[schedule\.id\]/);
assert.match(service, /preview\.warningFingerprint/);
assert.match(service, /WARNING_ACKNOWLEDGEMENT_REQUIRED/);
assert.match(service, /preview\.blockingIssues\.length/);
assert.match(service, /ALREADY_PUBLISHED/);
assert.match(service, /PUBLICATION_FAILED/);
assert.match(service, /PREVIEW_CONCURRENCY = 5/);
assert.match(service, /take: BULK_PUBLICATION_LIMIT/);

assert.match(workspace, /"publication"/);
assert.match(workspace, /PENDIENTES DE PUBLICACIÓN/);
assert.match(workspace, /PublicationSurface/);
assert.match(workspace, /listDraftPublicationQueue/);
assert.match(workspace, /PublicationQueue/);
assert.match(workspace, /SCHEDULE_STATUS_MANAGE/);
assert.match(workspace, /batchPublished/);
assert.match(workspace, /batchFailures/);

assert.match(queue, /SELECCIONAR TODO/);
assert.match(queue, /SOLO LISTAS/);
assert.match(queue, /PUBLICAR LISTAS/);
assert.match(queue, /PUBLICAR SELECCIONADAS/);
assert.match(queue, /ACTUALIZAR VALIDACIÓN/);
assert.match(queue, /acknowledgeWarnings/);
assert.match(queue, /name="scheduleId"/);
assert.match(queue, /warningFingerprint:/);
assert.match(queue, /FLIGHTS PREVISTOS/);
assert.match(queue, /ARCHIVAR SELECCIONADAS/);
assert.match(queue, />ARCHIVAR</);
assert.match(queue, /window\.confirm/);
assert.match(queue, /archiveProgramacionDraftsAction/);
assert.match(queue, /router\.refresh/);
assert.match(queue, /estado ARCHIVED/);

assert.match(actions, /bulkPublishProgramacionAction/);
assert.match(actions, /requireStaffPermission\("SCHEDULE_STATUS_MANAGE"/);
assert.match(actions, /publishFlightSchedulesBatch/);
assert.match(actions, /revalidatePath\("\/pilot\/flight-offers"\)/);
assert.match(actions, /batchMode/);
assert.match(actions, /batchFailures/);

assert.match(archiveActions, /"use server"/);
assert.match(archiveActions, /archiveFlightScheduleDraft/);
assert.match(archiveActions, /requireStaffPermission\("SCHEDULE_STATUS_MANAGE"/);
assert.match(archiveActions, /BULK_PUBLICATION_LIMIT/);
assert.match(archiveActions, /new Set/);
assert.match(archiveActions, /for \(const scheduleId of scheduleIds\)/);
assert.match(archiveActions, /revalidatePath\("\/staff\/operations\/programacion"\)/);
assert.doesNotMatch(archiveActions, /deleteMany|flightSchedule\.delete/);
assert.doesNotMatch(archiveActions, /prisma\.\$transaction/);

assert.match(management, /status: "ARCHIVED"/);
assert.match(management, /archivedAt: new Date\(\)/);
assert.match(management, /SCHEDULE_DRAFT_ARCHIVED/);
assert.match(management, /assertDraftEditable\(before\.status\)/);

assert.match(publication, /TransactionIsolationLevel\.Serializable/);
assert.match(publication, /pg_advisory_xact_lock/);
for (const forbidden of ["flightOffer.create", "pilotBooking.create", "flightDispatch.create", "ofpBriefing.create", "acarsSession.create", "pirep.create"]) {
  assert.doesNotMatch(service + actions + archiveActions, new RegExp(forbidden, "i"));
}

console.log("Bulk Programación publication and archive contracts passed (61 focused assertions).");
