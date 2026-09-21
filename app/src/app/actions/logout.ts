"use server";

import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/auth";
import { clearSessionCookie, readSessionToken } from "@/lib/session";

export async function logout(): Promise<void> {
  const token = await readSessionToken();
  if (token) deleteSession(token);
  await clearSessionCookie();
  redirect("/masuk");
}
