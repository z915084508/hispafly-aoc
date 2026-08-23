import {requireStaffPermission} from "@/lib/staff/authorization";
export default async function Layout({children}:{children:React.ReactNode}){await requireStaffPermission("PIREP_VIEW",{entityType:"PirepScoringPolicy",attemptedAction:"view PIREP scoring rules"});return children}
