import { NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { middleware } from "./middleware";

const BACKEND = "http://backend.test";

// MOCK: fetch is the true external boundary (backend HTTP); we only inspect the call.
const fetchMock = vi.fn<typeof fetch>();

// MOCK: NextFetchEvent is built by the Next runtime; only waitUntil is used here.
const fakeEvent = { waitUntil: vi.fn() } as unknown as NextFetchEvent;

function requestWith(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

function sentHeaders(): Headers {
  const init = fetchMock.mock.calls[0]?.[1];
  return new Headers(init?.headers);
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SCOUT_BACKEND_INTERNAL_URL", BACKEND);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("middleware UTM tracking", () => {
  it("forwards the incoming x-forwarded-for header to the backend", () => {
    middleware(
      requestWith("http://scout.test/?utm_source=reddit", {
        "x-forwarded-for": "203.0.113.7",
      }),
      fakeEvent,
    );

    expect(sentHeaders().get("x-forwarded-for")).toBe("203.0.113.7");
  });

  it("omits x-forwarded-for when the request has none", () => {
    middleware(requestWith("http://scout.test/?utm_source=reddit"), fakeEvent);

    expect(sentHeaders().has("x-forwarded-for")).toBe(false);
  });

  it("posts the utm fields as JSON to the backend", () => {
    middleware(
      requestWith(
        "http://scout.test/?utm_source=reddit&utm_medium=social&utm_campaign=launch",
      ),
      fakeEvent,
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      source: "reddit",
      medium: "social",
      campaign: "launch",
    });
  });

  it("does not call the backend without utm_source", () => {
    middleware(requestWith("http://scout.test/"), fakeEvent);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows backend failures so the page still renders", async () => {
    fetchMock.mockRejectedValue(new Error("backend down"));
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    const event = { waitUntil } as unknown as NextFetchEvent;

    middleware(requestWith("http://scout.test/?utm_source=reddit"), event);

    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });
});
