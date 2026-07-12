import { operationsRequest } from "@/lib/vamsys/operations"; import type { VamsysFleetData,VamsysFleetPayload } from "./types";
const unwrap=(value:unknown)=>((value as {data?:VamsysFleetData})?.data??value) as VamsysFleetData;
export async function listAllVamsysFleets(){const rows:VamsysFleetData[]=[];let cursor:string|null=null;do{const q=new URLSearchParams({"page[size]":"100",sort:"id",weight_unit:"kg"});if(cursor)q.set("page[cursor]",cursor);const page=await operationsRequest(`/fleet?${q}`) as {data:VamsysFleetData[];meta?:{next_cursor?:string|null}};rows.push(...(page.data??[]));cursor=page.meta?.next_cursor??null;}while(cursor);return rows;}
export const getVamsysFleet=async(id:string)=>unwrap(await operationsRequest(`/fleet/${encodeURIComponent(id)}?weight_unit=kg`));
export const createVamsysFleet=async(body:VamsysFleetPayload)=>unwrap(await operationsRequest("/fleet",{method:"POST",body,expectedStatus:201,requiredScope:"ops:config:write"}));
export const updateVamsysFleet=async(id:string,body:VamsysFleetPayload)=>unwrap(await operationsRequest(`/fleet/${encodeURIComponent(id)}?weight_unit=kg`,{method:"PUT",body,expectedStatus:200,requiredScope:"ops:config:write"}));
export const deleteVamsysFleet=async(id:string)=>operationsRequest(`/fleet/${encodeURIComponent(id)}`,{method:"DELETE",expectedStatus:204,requiredScope:"ops:config:write"});
