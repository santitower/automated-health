import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig, hasSupabaseEnv } from "./lib/supabase/config";

const publicPaths = new Set([
  "/auth/login",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/check-email",
  "/auth/callback",
  "/auth/confirm",
  "/downloads/instacart-agent",
]);

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next();

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(claimsData?.claims?.sub);
  const pathname = request.nextUrl.pathname;
  const isPublicPath = publicPaths.has(pathname);

  if (!isAuthenticated && !isPublicPath && !pathname.startsWith("/auth/update-password")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && (pathname === "/auth/login" || pathname === "/auth/sign-up")) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/";
    appUrl.search = "";
    return NextResponse.redirect(appUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|og.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
