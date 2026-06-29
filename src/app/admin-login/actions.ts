"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, setAdminSession, validateAdminCredentials } from "@/lib/staff/adminSession";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeNextPath(value: string) {
  return value.startsWith("/staff") ? value : "/staff";
}

export async function loginAdmin(formData: FormData) {
  const username = text(formData, "username");
  const password = text(formData, "password");
  const next = safeNextPath(text(formData, "next"));

  if (!validateAdminCredentials(username, password)) {
    redirect(`/admin-login?error=invalid_credentials&next=${encodeURIComponent(next)}`);
  }

  await setAdminSession();
  redirect(next);
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect("/admin-login?success=logged_out");
}
