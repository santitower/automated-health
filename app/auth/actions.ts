"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { hasSupabaseEnv } from "../../lib/supabase/config";

export type AuthActionState = { error?: string };

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeNext(formData: FormData, fallback = "/") {
  const next = value(formData, "next");
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

async function origin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signIn(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseEnv()) return { error: "Account access is not configured for this deployment yet." };
  const email = value(formData, "email");
  const password = value(formData, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(safeNext(formData));
}

export async function signUp(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseEnv()) return { error: "Account access is not configured for this deployment yet." };
  const email = value(formData, "email");
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const name = value(formData, "name");
  if (!name || !email || password.length < 8) {
    return { error: "Add your name, a valid email, and a password of at least 8 characters." };
  }
  if (password !== confirmPassword) return { error: "The passwords do not match." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${await origin()}/auth/login?confirmed=1`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/");
  redirect(`/auth/check-email?email=${encodeURIComponent(email)}`);
}

export async function signInWithGoogle(formData: FormData) {
  if (!hasSupabaseEnv()) redirect("/auth/login?error=Account%20access%20is%20not%20configured%20for%20this%20deployment%20yet.");
  const supabase = await createClient();
  const next = safeNext(formData);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
  redirect(data.url);
}

export async function requestPasswordReset(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseEnv()) return { error: "Account access is not configured for this deployment yet." };
  const email = value(formData, "email");
  if (!email) return { error: "Enter the email address for your account." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/auth/update-password`,
  });
  if (error) return { error: error.message };
  redirect(`/auth/check-email?email=${encodeURIComponent(email)}&reset=1`);
}

export async function updatePassword(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseEnv()) return { error: "Account access is not configured for this deployment yet." };
  const password = value(formData, "password");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  if (!hasSupabaseEnv()) redirect("/");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
