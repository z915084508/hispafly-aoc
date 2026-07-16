import { redirect } from "next/navigation";
export default function EditFleet() { redirect("/staff/fleets?error=vAMSYS%20legacy%20fleets%20are%20read-only."); }
