import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const form = read("../../app/staff/routes/route-form.tsx");
const actions = read("../../app/staff/routes/actions.ts");
const automatic = read("./automatic-route.ts");
const management = read("../native-scheduling/management.ts");
const scheduleForm = read("../../components/programacion/schedule-form.tsx");

assert.match(form, /name="compatibleFleetIds" multiple required/);
assert.match(actions, /getAll\("compatibleFleetIds"\)/);
assert.match(automatic, /routeFleetAssignment\.createMany/);
assert.match(automatic, /returnRoute![.]id/);
assert.match(management, /FLEET_NOT_COMPATIBLE/);
assert.match(scheduleForm, /selectableFleets/);
assert.match(scheduleForm, /Solo aparecen las flotas compatibles/);

console.log("Route compatible fleets and Programacion subset contracts passed.");
