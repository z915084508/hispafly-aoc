import { redirect } from "next/navigation";
import { currentAuthUser } from "@/lib/auth/session";

const BUILT_IN_TESTER_EMAILS = new Set([
  "biciarreglopalma@gmail.com",
]);

type AcarsAccessUser = {
  email?: string | null;
  pilot?: { acarsBetaAccess?: boolean | null } | null;
  roles?: Array<{ role?: { code?: string | null } | null }>;
};

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

function configuredTesterEmails() {
  return new Set(
    (process.env.ACARS_TESTER_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function hasAcarsTestAccess(user: AcarsAccessUser | null | undefined) {
  if (user?.pilot?.acarsBetaAccess) return true;
  const email = normalizeEmail(user?.email);
  if (!email) return false;

  if (BUILT_IN_TESTER_EMAILS.has(email)) return true;
  if (configuredTesterEmails().has(email)) return true;
  if (normalizeEmail(process.env.AOC_OWNER_EMAIL) === email) return true;

  return Boolean(user?.roles?.some(({ role }) => role?.code === "ADMIN"));
}

export async function requireAcarsTestAccess() {
  const user = await currentAuthUser();
  if (!user?.pilot) redirect("/pilot?error=login_required");
  if (!hasAcarsTestAccess(user)) redirect("/pilot/dashboard?error=acars_beta_access_required");
  return user;
}
