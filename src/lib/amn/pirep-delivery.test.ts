import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the production sender with an in-memory persistence boundary and HTTP peer.
let sent = 0;
let failHttp = false;
let wrongReceipt = false;
const report = { id: "native-1", dataOrigin: "HISPAFLY_NATIVE", status: "accepted", passengers: 90, freightKg: 300, flownAt: new Date("2026-09-05T00:20:00Z"), rawData: { telemetry: "retain" } as Record<string, unknown>, pilotBooking: { dataOrigin: "HISPAFLY_NATIVE", amnPayloadRequestId: "allocation", amnPayloadProvenance: { externalFlightId: "adhoc:original", operatingDate: "2026-09-04" }, estimatedArrivalAt: new Date("2026-09-05T00:00:00Z") } };
const fake = { pirep: { findUnique: async () => structuredClone(report), updateMany: async ({ data }: { data: { rawData: Record<string, unknown> } }) => { report.rawData = data.rawData; return { count: 1 }; } } };
(globalThis as Record<string, unknown>).__amnTestPrisma = fake;
const source = readFileSync(new URL("./pirep-delivery.ts", import.meta.url), "utf8").replace('import { prisma } from "@/lib/prisma";', 'const prisma = globalThis.__amnTestPrisma;');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('from "@prisma/client"', `from ${JSON.stringify(import.meta.resolve("@prisma/client"))}`);
const { deliverAmnPirep } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
process.env.AMN_API_BASE_URL = "https://amn.example";
process.env.AMN_API_KEY = "test-key";
globalThis.fetch = async (_url, options) => {
  sent++;
  const body = JSON.parse(String(options?.body));
  assert.equal(body.externalFlightId, "adhoc:original");
  assert.equal(body.operatingDate, "2026-09-04", "UTC arrival day cannot replace original operating day");
  assert.equal(body.actualCargoWeightKg, 300, "freight excludes baggage");
  if (failHttp) return new Response("upstream private detail", { status: 503 });
  return Response.json({ ...body, externalFlightId: wrongReceipt ? "other" : body.externalFlightId, pirepId: "amn-pirep" });
};
report.dataOrigin = "VAMSYS"; assert.equal(await deliverAmnPirep(report.id), "SKIPPED"); assert.equal(sent, 0);
report.dataOrigin = "HISPAFLY_NATIVE"; report.status = "manual_review"; assert.equal(await deliverAmnPirep(report.id), "SKIPPED"); assert.equal(sent, 0);
report.status = "accepted"; failHttp = true;
assert.equal(await deliverAmnPirep(report.id), "RETRY"); assert(!JSON.stringify(report.rawData).includes("private detail"));
failHttp = false; wrongReceipt = true; assert.equal(await deliverAmnPirep(report.id), "RETRY");
wrongReceipt = false; assert.equal(await deliverAmnPirep(report.id), "DELIVERED"); assert.equal(report.rawData.telemetry, "retain");
const before = sent; assert.equal(await deliverAmnPirep(report.id), "DELIVERED"); assert.equal(sent, before);
report.rawData = {}; report.pilotBooking.amnPayloadProvenance.externalFlightId = "";
assert.equal(await deliverAmnPirep(report.id), "RETRY"); assert.equal(sent, before);
console.log("Native PIREP delivery: legacy exclusion, review gate, retry, receipt identity, original day and receipt persistence passed.");
