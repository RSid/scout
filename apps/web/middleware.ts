import { NextRequest, NextResponse } from "next/server";

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export function middleware(request: NextRequest): NextResponse {
  const url = request.nextUrl;
  const source = url.searchParams.get("utm_source");

  if (source) {
    const medium = url.searchParams.get("utm_medium") ?? "";
    const campaign = url.searchParams.get("utm_campaign") ?? "";

    const backendBase =
      process.env.SCOUT_BACKEND_INTERNAL_URL?.replace(/\/$/, "") ?? "";

    if (backendBase) {
      const body = JSON.stringify({ source, medium, campaign });

      // Fire-and-forget — don't block page load for analytics
      fetch(`${backendBase}/api/utm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {
        // Silently swallow — UTM tracking must never break the user experience
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/plan", "/about"],
};
