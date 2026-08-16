import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { hasSupabaseEnv } from "../../../lib/supabase/config";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.clone();
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  redirectTo.pathname = safeNext(request.nextUrl.searchParams.get("next"));
  redirectTo.search = "";

  if (hasSupabaseEnv() && tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (!error) return NextResponse.redirect(redirectTo);

    console.error("[auth/confirm] Unable to verify email token", {
      code: error.code,
      status: error.status,
      type,
    });
  }

  redirectTo.pathname = "/auth/login";
  redirectTo.searchParams.set(
    "error",
    "This confirmation link is invalid or expired. Request a new email and try again.",
  );
  return NextResponse.redirect(redirectTo);
}
