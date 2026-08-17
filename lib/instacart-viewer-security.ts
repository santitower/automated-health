export const INSTACART_ALLOWED_DOMAINS = [
  "instacart.com",
  "*.instacart.com",
  "*.icpublic.com",
  "d2guulkeunn7d8.cloudfront.net",
  "www.google.com",
  "www.gstatic.com",
  "fonts.gstatic.com",
] as const;

export function buildPrivateViewerUrl(
  domain: string,
  viewerToken: string,
  vncPassword: string,
) {
  const liveUrl = new URL("/nutriplan.html", domain);
  liveUrl.hash = new URLSearchParams({
    token: viewerToken,
    password: vncPassword,
  }).toString();
  return liveUrl.toString();
}
