import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BasemapInner from "./BasemapInner";
import { AnnounceProvider } from "@/components/a11y/AnnounceProvider";

import { DEMO_ROUTE, demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";
import { en } from "@/lib/i18n/messages";

const stubs = vi.hoisted(() => {
  // MOCK: MapLibre pulls WebGL; stub construction so axe can inspect the landmark wiring.
  type MapInteractiveStub = { flushLoadHandlers: () => void };
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

    constructor() {
      instancesLocal.push(this);
    }

    flushLoadHandlers() {
      for (const fn of this.listeners.get("load") ?? []) {
        fn({});
      }
    }

    on(type: string, fn: (...args: unknown[]) => void) {
      const queue = this.listeners.get(type);
      if (queue) queue.push(fn);
      else this.listeners.set(type, [fn]);
    }

    readonly addControl = vi.fn();

    readonly addLayer = vi.fn();

    readonly addSource = vi.fn();

    readonly getCanvasContainer = () => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    readonly getSource = vi.fn(() => ({
      getClusterExpansionZoom: () => Promise.reject(new Error("MOCK_CLUSTER")),
    }));

    readonly remove = vi.fn();

    readonly resize = vi.fn();

    readonly easeTo = vi.fn();

    readonly zoomIn = vi.fn();
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
});
