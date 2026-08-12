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

export function hasAcarsBetaAccess(user: AcarsAccessUser | null | undefined) {
  if (user?.pilot?.acarsBetaAccess) return true;
  const email = normalizeEmail(user?.email);
  if (!email) return false;

  if (BUILT_IN_TESTER_EMAILS.has(email)) return true;
  if (configuredTesterEmails().has(email)) return true;
  if (normalizeEmail(process.env.AOC_OWNER_EMAIL) === email) return true;

  return Boolean(user?.roles?.some(({ role }) => role?.code === "ADMIN"));
}

/** @deprecated Use hasAcarsBetaAccess for the Beta/Early Access channel. */
export const hasAcarsTestAccess = hasAcarsBetaAccess;

export async function requireAcarsPilotAccess() {
  const user = await currentAuthUser();
  if (!user?.pilot) redirect("/pilot?error=login_required");
  return user;
}

export async function requireAcarsBetaAccess() {
  const user = await requireAcarsPilotAccess();
  if (!hasAcarsBetaAccess(user)) redirect("/pilot/dashboard?error=acars_beta_access_required");
  return user;
}

/** @deprecated Use requireAcarsBetaAccess for the Beta/Early Access channel. */
export const requireAcarsTestAccess = requireAcarsBetaAccess;
