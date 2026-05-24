import { ScoutApiError } from "@/lib/api";
import type { AddressHit, GeocodingProvider } from "@/lib/providers/geocoding";
import { backendGeocodingProvider } from "@/lib/providers/geocoding/backend";
import { STUB_SEARCH_HITS } from "@/lib/providers/geocoding/stub";
import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import AddressAutocomplete from "./AddressAutocomplete";

function makeProviders(
  overrides: Partial<{
    search: GeocodingProvider["search"];
    reverse: GeocodingProvider["reverse"];
  }> = {},
): GeocodingProvider {
  async function defaultSearch(): Promise<readonly AddressHit[]> {
    return [...STUB_SEARCH_HITS];
  }

  async function defaultReverse(lon: number, lat: number): Promise<AddressHit> {
    return { id: "reverse-default", label: `${String(lon)} ${String(lat)}`, lon, lat };
  }

  return {
    search: overrides.search ?? defaultSearch,
    reverse: overrides.reverse ?? defaultReverse,
  };
}

describe("AddressAutocomplete", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER", "stub");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("backend provider outbound shaping (DEC-022)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () =>
            ({
              hits: [{ id: "h1", lon: -1, lat: -2, label: "DC hit" }],
            }) satisfies Record<string, unknown>,
        }),
      );
    });

    it("calls Scout's own /api/geocode/search (no upstream from the browser)", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <AnnounceProvider>
          <AddressAutocomplete
            id="scout-start"
            label="Starting point"
            onPick={vi.fn()}
            provider={backendGeocodingProvider}
          />
        </AnnounceProvider>,
      );

      await user.type(screen.getByRole("combobox"), "main");

      await waitFor(() => expect(fetch).toHaveBeenCalled());

      const calledUrl = String(vi.mocked(fetch).mock.calls.at(0)?.at(0) ?? "");

      expect(calledUrl).toContain("/api/geocode/search");
      expect(calledUrl).toContain("q=main");
      expect(calledUrl).not.toContain("nominatim");
      expect(calledUrl).not.toContain("openstreetmap");
    });
  });

  it("pipes picked selections through onPick", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          onPick={onPick}
          provider={makeProviders()}
        />
      </AnnounceProvider>,
    );

    const combobox = screen.getByRole("combobox", { name: /starting point/i });

    await user.type(combobox, "Dupont Circle");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ suggestion/i),
    );

    await user.click(screen.getByRole("button", { name: /show suggestions/i }));

    const option = await screen.findByRole("option", {
      name: /Dupont Circle, Washington/i,
    });

    await user.click(option);

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ lon: -77.0369, lat: 38.9097 }),
    );
  });

  it("runs one provider.search after idle typing settles", async () => {
    const search = vi.fn().mockResolvedValue([...STUB_SEARCH_HITS]);
    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          onPick={vi.fn()}
          provider={makeProviders({ search })}
        />
      </AnnounceProvider>,
    );

    await user.type(screen.getByRole("combobox"), "abcd");

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));

    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      { limit: 5 },
      expect.any(AbortSignal),
    );
  });

  it("does not invoke geolocation before Use my location is clicked", () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      geolocation: { getCurrentPosition },
    } as Navigator);

    render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          showUseMyLocation
          onPick={vi.fn()}
          provider={makeProviders()}
        />
      </AnnounceProvider>,
    );

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("fills the combo with the reverse label after GPS succeeds", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback): void => {
      success({
        coords: {
          longitude: -77.05,
          latitude: 38.91,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      geolocation: { getCurrentPosition },
    } as Navigator);

    const reverse = vi.fn().mockResolvedValue<AddressHit>({
      id: "rev-hit",
      label: "Mapped label from reverse",
      lon: -77.05,
      lat: 38.91,
    });

    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          showUseMyLocation
          onPick={vi.fn()}
          provider={makeProviders({ reverse })}
        />
      </AnnounceProvider>,
    );

    await user.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => expect(reverse).toHaveBeenCalled());

    expect(reverse.mock.calls.at(0)?.at(0)).toBe(-77.05);
    expect(reverse.mock.calls.at(0)?.at(1)).toBe(38.91);

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveValue("Mapped label from reverse"),
    );
  });

  it("announces when permission is declined", async () => {
    const getCurrentPosition = vi.fn(
      (_ok?: PositionCallback, err?: PositionErrorCallback) => {
        err?.({
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          code: 1,
          message: "denied",
        });
      },
    );

    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      geolocation: { getCurrentPosition },
    } as Navigator);

    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          showUseMyLocation
          onPick={vi.fn()}
          provider={makeProviders()}
        />
      </AnnounceProvider>,
    );

    await user.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /Location permission was declined/i,
      ),
    );
  });

  it("announces how many suggestion rows returned", async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete id="scout-start" label="Starting point" onPick={vi.fn()} />
      </AnnounceProvider>,
    );

    await user.type(screen.getByRole("combobox"), "14th");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ suggestion/i),
    );
  });

  it("adds approximate distance cues when userLocation is provided", async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          onPick={vi.fn()}
          userLocation={[-77.05, 38.915]}
          provider={makeProviders()}
        />
      </AnnounceProvider>,
    );

    await user.type(screen.getByRole("combobox"), "Dup");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ suggestion/i),
    );

    await user.click(screen.getByRole("button", { name: /show suggestions/i }));

    await waitFor(() =>
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0),
    );

    expect(screen.getAllByRole("option")[0]?.textContent).toMatch(/~\d+ meter/i);
  });

  it("highlights suggestions with arrows and selects with Enter", async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <AnnounceProvider>
        <AddressAutocomplete id="scout-start" label="Starting point" onPick={vi.fn()} />
      </AnnounceProvider>,
    );

    const combobox = screen.getByRole("combobox");

    await user.type(combobox, "14th");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ suggestion/i),
    );

    await user.click(screen.getByRole("button", { name: /show suggestions/i }));

    await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    await waitFor(() =>
      expect((combobox as HTMLInputElement).value.toLowerCase()).toContain(
        "dupont circle",
      ),
    );
  });
});

describe("AddressAutocomplete axe", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SCOUT_GEOCODING_PROVIDER", "stub");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function axeViolations(host: HTMLElement): Promise<unknown[]> {
    const report = await axe(host);
    return report.violations;
  }

  it("covers the closed idle state", async () => {
    const { container } = render(
      <AnnounceProvider>
        <AddressAutocomplete id="scout-start" label="Starting point" onPick={vi.fn()} />
      </AnnounceProvider>,
    );

    expect(await axeViolations(container)).toStrictEqual([]);
  });

  it("covers an expanded listbox", async () => {
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <AnnounceProvider>
        <AddressAutocomplete id="scout-start" label="Starting point" onPick={vi.fn()} />
      </AnnounceProvider>,
    );

    await user.type(screen.getByRole("combobox"), "Dup");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/\d+ suggestion/i),
    );

    await user.click(screen.getByRole("button", { name: /show suggestions/i }));

    await waitFor(() =>
      expect(screen.getAllByRole("option", { hidden: true }).length).toBeGreaterThan(0),
    );

    expect(await axeViolations(container)).toStrictEqual([]);
  });

  it("covers an empty-result search", async () => {
    const search = vi.fn().mockResolvedValue([] as AddressHit[]);
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          onPick={vi.fn()}
          provider={makeProviders({ search })}
        />
      </AnnounceProvider>,
    );

    await user.type(screen.getByRole("combobox"), "zzz");
    await waitFor(() => expect(search).toHaveBeenCalled());

    expect(await axeViolations(container)).toStrictEqual([]);
  });

  it("covers an error surfaced from the provider", async () => {
    const search = vi.fn().mockRejectedValue(new ScoutApiError("network fail", "X"));
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <AnnounceProvider>
        <AddressAutocomplete
          id="scout-start"
          label="Starting point"
          onPick={vi.fn()}
          provider={makeProviders({ search })}
        />
      </AnnounceProvider>,
    );

    await user.type(screen.getByRole("combobox"), "abc");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/network fail/i),
    );

    expect(await axeViolations(container)).toStrictEqual([]);
  });
});
