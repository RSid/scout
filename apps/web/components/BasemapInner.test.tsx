import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BasemapInner from "./BasemapInner";
import { AnnounceProvider } from "@/components/a11y/AnnounceProvider";

import { DEMO_ROUTE, demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";
import { en } from "@/lib/i18n/messages";

const stubs = vi.hoisted(() => {
  // MOCK: MapLibre pulls WebGL; stub construction so the lifecycle invariants
  // from #50 / #51 can be asserted without a real GL context. Tracks ctor
  // count, per-source setData spies, isStyleLoaded gating, and resize calls.
  type MapInteractiveStub = {
    readonly listeners: Map<string, Array<(...args: unknown[]) => void>>;
    readonly constructorOptions: { keyboard?: boolean } | undefined;
    flushLoadHandlers: () => void;
    isStyleLoaded: () => boolean;
    sourceSetDataSpy: (id: string) => ReturnType<typeof vi.fn> | undefined;
    resize: ReturnType<typeof vi.fn>;
    easeTo: ReturnType<typeof vi.fn>;
  };
  let instancesLocal: MapInteractiveStub[] = [];

  class NavigationControl {}
  class Popup {
    addTo() {
      return this;
    }

    remove() {}

    setHTML() {
      return this;
    }

    setLngLat() {
      return this;
    }

    getElement() {
      return null;
    }
  }

  class MapStubCtor {
    readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    // Each source id has one stable stub object for the lifetime of the stub
    // map, so production's `getSource(id).setData(...)` lands on the same spy
    // call after call (matches the real MapLibre identity contract).
    readonly sourceStubs = new Map<
      string,
      {
        setData: ReturnType<typeof vi.fn>;
        getClusterExpansionZoom: () => Promise<number>;
      }
    >();
    styleLoaded = false;

    readonly constructorOptions: { keyboard?: boolean } | undefined;

    constructor(options?: { keyboard?: boolean }) {
      this.constructorOptions = options;
      instancesLocal.push(this);
    }

    flushLoadHandlers() {
      this.styleLoaded = true;
      for (const fn of this.listeners.get("load") ?? []) {
        fn({});
      }
    }

    on(
      type: string,
      layerOrFn: string | ((...args: unknown[]) => void),
      fnMaybe?: (...args: unknown[]) => void,
    ) {
      const fn =
        typeof layerOrFn === "function"
          ? layerOrFn
          : (fnMaybe ?? ((): void => undefined));
      const queue = this.listeners.get(type);
      if (queue) queue.push(fn);
      else this.listeners.set(type, [fn]);
    }

    isStyleLoaded() {
      return this.styleLoaded;
    }

    sourceSetDataSpy(id: string) {
      return this.sourceStubs.get(id)?.setData;
    }

    readonly addControl = vi.fn();

    readonly addLayer = vi.fn();

    readonly addSource = vi.fn();

    readonly getCanvasContainer = () => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    readonly getSource = vi.fn((id: string) => {
      let stub = this.sourceStubs.get(id);
      if (!stub) {
        stub = {
          setData: vi.fn(),
          /* Resolve so cluster taps exercise map.easeTo (reduced-motion branch). */
          getClusterExpansionZoom: () => Promise.resolve(14),
        };
        this.sourceStubs.set(id, stub);
      }
      return stub;
    });

    readonly remove = vi.fn();

    readonly resize = vi.fn();

    readonly easeTo = vi.fn();

    readonly zoomIn = vi.fn();

    readonly fitBounds = vi.fn();
  }

  return {
    MapStubCtor,
    get instances(): MapInteractiveStub[] {
      return instancesLocal;
    },
    resetMaps() {
      instancesLocal = [];
    },
    NavigationControl,
    Popup,
  };
});

// MOCK: jsdom's ResizeObserver is a no-op stub from vitest.setup.ts; this
// file overrides it per-test so the lifecycle test can fire a synthetic
// resize callback and assert that BasemapInner forwards it to map.resize().
const resizeObserverCallbacks: ResizeObserverCallback[] = [];

vi.mock("maplibre-gl", () => {
  const maplib = {
    Map: stubs.MapStubCtor,
    NavigationControl: stubs.NavigationControl,
    Popup: stubs.Popup,
    addProtocol: vi.fn(),
    removeProtocol: vi.fn(),
  };

  return {
    __esModule: true,
    default: maplib,
    ...maplib,
  };
});

async function flushMapLoads() {
  await waitFor(() => {
    expect(stubs.instances.length).toBeGreaterThan(0);
  });

  for (const inst of stubs.instances) {
    inst.flushLoadHandlers();
  }
}

describe("BasemapInner", () => {
  beforeEach(() => {
    stubs.resetMaps();
    resizeObserverCallbacks.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      vi.fn().mockImplementation((cb: ResizeObserverCallback) => {
        resizeObserverCallbacks.push(cb);
        return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the M1-F02 landmarks for assistive tech and passes axe once layers mount", async () => {
    const { container } = render(
      <AnnounceProvider>
        <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
      </AnnounceProvider>,
    );

    await flushMapLoads();

    const mapLandmark = screen.getByRole("application", { name: en.mapPlanAriaLabel });
    expect(mapLandmark).toHaveAccessibleDescription(en.mapPlanKeyboardHint);
    expect(mapLandmark.getAttribute("aria-describedby")).toBe(
      "scout-map-keyboard-hint",
    );

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("enables MapLibre keyboard handling so the M+arrow pan hint is accurate (M1-F02.S2)", async () => {
    render(
      <AnnounceProvider>
        <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
      </AnnounceProvider>,
    );

    await flushMapLoads();

    expect(stubs.instances[0]?.constructorOptions?.keyboard).toBe(true);
  });

  // Acceptance criteria carried forward from #50 into the follow-up #51:
  // data prop changes must NOT recreate the MapLibre instance; they must push
  // through getSource(id).setData. A synthetic ResizeObserver firing must call
  // map.resize() so late layout passes are honoured. Each `it` exercises one
  // behaviour, per AGENTS.md.
  describe("lifecycle (#50 / #51)", () => {
    it("keeps a single MapLibre instance and forwards new corridor data through cluster-points.setData", async () => {
      const { rerender } = render(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      await flushMapLoads();

      rerender(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      rerender(
        <AnnounceProvider>
          <BasemapInner
            corridor={demoCorridorFeatures().slice(0, 1)}
            route={DEMO_ROUTE}
          />
        </AnnounceProvider>,
      );

      expect(stubs.instances).toHaveLength(1);
      await waitFor(() => {
        expect(
          stubs.instances[0].sourceSetDataSpy("cluster-points"),
        ).toHaveBeenCalledTimes(2);
      });
    });

    it("keeps a single MapLibre instance and forwards new route data through route-line.setData", async () => {
      const { rerender } = render(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      await flushMapLoads();

      const reroute1: typeof DEMO_ROUTE = { ...DEMO_ROUTE, id: "reroute-1" };
      const reroute2: typeof DEMO_ROUTE = { ...DEMO_ROUTE, id: "reroute-2" };

      rerender(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={reroute1} />
        </AnnounceProvider>,
      );
      rerender(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={reroute2} />
        </AnnounceProvider>,
      );

      expect(stubs.instances).toHaveLength(1);
      await waitFor(() => {
        expect(stubs.instances[0].sourceSetDataSpy("route-line")).toHaveBeenCalledTimes(
          2,
        );
      });
    });

    it("calls map.resize() when its container reports a new size", async () => {
      render(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      await flushMapLoads();

      const map = stubs.instances[0];
      // Clear the synchronous + requestAnimationFrame resize calls the mount
      // effect already issued; only the synthetic ResizeObserver fire should
      // contribute to the assertion below.
      map.resize.mockClear();

      expect(resizeObserverCallbacks).toHaveLength(1);
      resizeObserverCallbacks[0]([], {} as ResizeObserver);

      expect(map.resize).toHaveBeenCalledTimes(1);
    });

    it("calls fitBounds with animation when prefers-reduced-motion defaults to motion allowed", async () => {
      render(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      await flushMapLoads();

      const mapStub = stubs.instances[0];
      await waitFor(() => expect(mapStub.fitBounds).toHaveBeenCalled());

      expect(mapStub.fitBounds).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          padding: 48,
          maxZoom: 16,
          animate: true,
          duration: 600,
        }),
      );
    });
  });

  describe("prefers-reduced-motion (M1-F02.S5)", () => {
    // MOCK: matchMedia gates motion branches in BasemapInner at map mount time.
    beforeEach(() => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );
    });

    it("clusters easeTo snaps without easing when prefers-reduced-motion is set", async () => {
      render(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      await flushMapLoads();

      const mapStub = stubs.instances[0];
      const handlers = mapStub.listeners.get("click") ?? [];
      const clustersHandler = handlers[0]!;
      clustersHandler({
        features: [
          {
            geometry: { type: "Point" },
            properties: { cluster_id: 1 },
          },
        ],
        lngLat: { lng: -77.03, lat: 38.9 },
      });

      await waitFor(() => {
        expect(mapStub.easeTo).toHaveBeenCalledWith(
          expect.objectContaining({
            animate: false,
            duration: 0,
          }),
        );
      });
    });

    it("fitBounds skips route framing animation when prefers-reduced-motion is set", async () => {
      render(
        <AnnounceProvider>
          <BasemapInner corridor={demoCorridorFeatures()} route={DEMO_ROUTE} />
        </AnnounceProvider>,
      );
      await flushMapLoads();

      const mapStub = stubs.instances[0];
      await waitFor(() => expect(mapStub.fitBounds).toHaveBeenCalled());

      expect(mapStub.fitBounds).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          animate: false,
          duration: 0,
          padding: 48,
          maxZoom: 16,
        }),
      );
    });
  });
});
