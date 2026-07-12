import { operationsRequest } from "@/lib/vamsys/operations";
import type { VamsysRouteData, VamsysRoutePayload } from "./types";

type Page = { data: VamsysRouteData[]; meta?: { next_cursor?: string | null } };
const unwrap = (value: unknown) => {
  const root = value as { data?: VamsysRouteData };
  return root?.data ?? value as VamsysRouteData;
};

export async function listAllVamsysRoutes() {
  const result: VamsysRouteData[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ "page[size]": "100", sort: "id", weight_unit: "kg" });
    if (cursor) query.set("page[cursor]", cursor);
    const page = await operationsRequest(`/routes?${query}`) as Page;
    result.push(...(page.data ?? []));
    cursor = page.meta?.next_cursor ?? null;
  } while (cursor);
  return result;
}

export const getVamsysRoute = async (id: string) => unwrap(await operationsRequest(`/routes/${encodeURIComponent(id)}?weight_unit=kg`));
export const createVamsysRoute = async (body: VamsysRoutePayload) => unwrap(await operationsRequest("/routes?weight_unit=kg", { method: "POST", body, expectedStatus: 201, requiredScope: "ops:config:write" }));
export const updateVamsysRoute = async (id: string, body: VamsysRoutePayload) => unwrap(await operationsRequest(`/routes/${encodeURIComponent(id)}?weight_unit=kg`, { method: "PUT", body, expectedStatus: 200, requiredScope: "ops:config:write" }));
export const deleteVamsysRoute = async (id: string) => operationsRequest(`/routes/${encodeURIComponent(id)}`, { method: "DELETE", expectedStatus: 204, requiredScope: "ops:config:write" });
