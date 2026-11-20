import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

function utmBackendBase(): string {
  return (
    process.env.SCOUT_BACKEND_INTERNAL_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SCOUT_API_BASE_URL?.replace(/\/$/, "") ||
    ""
  );
}

export function middleware(request: NextRequest, event: NextFetchEvent): NextResponse {
  const url = request.nextUrl;
  const source = url.searchParams.get("utm_source");

  if (source) {
    const medium = url.searchParams.get("utm_medium") ?? "";
    const campaign = url.searchParams.get("utm_campaign") ?? "";
    const backendBase = utmBackendBase();

    if (backendBase) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // This call goes straight to the backend, bypassing the proxy, so forward the
      // visitor's address (as set by the in-image Caddy) or every visitor shares one
      // rate-limit bucket. Never logged.
      const forwardedFor = request.headers.get("x-forwarded-for");
      if (forwardedFor) {
        headers["X-Forwarded-For"] = forwardedFor;
      }

      const pending = fetch(`${backendBase}/api/utm`, {
        method: "POST",
        headers,
        body: JSON.stringify({ source, medium, campaign }),
      }).catch(() => {
        // UTM tracking must never break the user experience
      });

      event.waitUntil(pending);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/plan", "/about"],
};
