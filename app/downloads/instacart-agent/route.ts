const RELEASE_BASE = "https://github.com/santitower/automated-health/releases/download/instacart-agent-v0.3.0";
const RELEASE_PAGE = "https://github.com/santitower/automated-health/releases/tag/instacart-agent-v0.3.0";

export function GET(request: Request) {
  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  let installerUrl = RELEASE_PAGE;

  if (!/android|iphone|ipad|ipod|mobile/.test(userAgent)) {
    if (/macintosh|mac os x/.test(userAgent)) {
      installerUrl = `${RELEASE_BASE}/NutriPlan-Instacart-Agent-v0.3.0.pkg`;
    } else if (/windows/.test(userAgent)) {
      installerUrl = `${RELEASE_BASE}/Install-NutriPlan-Instacart-Agent.cmd`;
    } else if (/linux|x11/.test(userAgent)) {
      installerUrl = `${RELEASE_BASE}/install-linux.sh`;
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "private, no-store",
      Location: installerUrl,
      Vary: "User-Agent",
    },
  });
}
