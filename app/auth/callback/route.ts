import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { hasSupabaseEnv } from "../../../lib/supabase/config";

export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/auth/login?error=Account%20access%20is%20not%20configured", request.url));
  }
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));

    console.error("[auth/callback] Unable to exchange authorization code", {
      code: error.code,
      status: error.status,
    });
  }

  return NextResponse.redirect(
    new URL(
      "/auth/login?error=Your%20email%20may%20already%20be%20confirmed.%20Sign%20in%20with%20your%20email%20and%20password.",
      request.url,
    ),
  );
}
