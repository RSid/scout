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
      const pending = fetch(`${backendBase}/api/utm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
