"use client";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import { ScoutApiError } from "@/lib/api";
import { formatApproxMeters, roughDistanceMeters } from "@/lib/geo";
import type { AddressHit, GeocodingProvider } from "@/lib/providers/geocoding";
import { getGeocodingProvider } from "@/lib/providers/geocoding";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";

const DEBOUNCE_MS = 500;

type LocationStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "error"; message: string };

type SuggestionItem = AddressHit & { suggestionText: string };

function buildSuggestionText(
  hit: AddressHit,
  userLocation: readonly [number, number] | null | undefined,
): string {
  if (!userLocation) {
    return hit.label;
  }
  const meters = roughDistanceMeters(
    userLocation[0],
    userLocation[1],
    hit.lon,
    hit.lat,
  );
  return `${hit.label} · ${formatApproxMeters(meters)}`;
}

function toSuggestionItems(
  hits: readonly AddressHit[],
  userLocation: readonly [number, number] | null | undefined,
): readonly SuggestionItem[] {
  return hits.map((hit) => ({
    ...hit,
    suggestionText: buildSuggestionText(hit, userLocation),
  }));
}

export type AddressAutocompleteProps = Readonly<{
  id: string;
  label: string;
  showUseMyLocation?: boolean | undefined;
  userLocation?: readonly [number, number] | null | undefined;
  onPick: (hit: AddressHit) => void;
  onUserLocationAcquired?: ((coords: readonly [number, number]) => void) | undefined;
  provider?: GeocodingProvider | undefined;
}>;

export default function AddressAutocomplete({
  id,
  label,
  showUseMyLocation = false,
  userLocation,
  onPick,
  onUserLocationAcquired,
  provider: providerProp,
}: AddressAutocompleteProps) {
  const announce = useAnnounce();
  const provider = useMemo(
    () => providerProp ?? getGeocodingProvider(),
    [providerProp],
  );
  const debounceTimer = useRef<number | undefined>(undefined);
  const abortController = useRef<AbortController | undefined>(undefined);
  const [inputValue, setInputValue] = useState("");
  const [hits, setHits] = useState<readonly AddressHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>({
    kind: "idle",
  });

  const suggestionItems = useMemo(
    () => toSuggestionItems(hits, userLocation),
    [hits, userLocation],
  );

  const runGeocode = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      abortController.current?.abort();
      abortController.current = undefined;

      if (trimmed.length < 3) {
        setHits([]);
        setBusy(false);
        return;
      }

      const controller = new AbortController();
      abortController.current = controller;
      setBusy(true);

      try {
        const nextHits = await provider.search(
          trimmed,
          { limit: 5 },
          controller.signal,
        );
        const nextArray = [...nextHits];
        setHits(nextArray);

        announce(
          nextArray.length === 0
            ? "No suggestions"
            : `${String(nextArray.length)} ${nextArray.length === 1 ? "suggestion" : "suggestions"}`,
        );
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const fallback =
          error instanceof ScoutApiError
            ? error.message
            : "Address search isn't responding — try a shorter query.";
        announce(fallback);
        setHits([]);
      } finally {
        setBusy(false);
      }
    },
    [announce, provider],
  );

  useEffect(() => {
    window.clearTimeout(debounceTimer.current);
    const trimmed = inputValue.trim();
    if (trimmed.length >= 3) {
      setBusy(true);
    } else {
      setBusy(false);
    }
    debounceTimer.current = window.setTimeout(() => {
      void runGeocode(inputValue);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(debounceTimer.current);
  }, [inputValue, runGeocode]);

  const trimmedForHint = inputValue.trim();

  return (
    <ComboBox
      id={id}
      allowsCustomValue
      menuTrigger="manual"
      aria-label={label}
      items={suggestionItems}
      inputValue={inputValue}
      onInputChange={(value) => setInputValue(value)}
      className="space-y-[var(--space-3)] text-[color:var(--color-text)]"
      onSelectionChange={(key) => {
        if (key == null) {
          return;
        }
        const match = suggestionItems.find((item) => String(item.id) === String(key));
        if (!match) {
          return;
        }

        onPick(match);
        announce(`Selected ${match.suggestionText}`);
        window.setTimeout(() => setInputValue(match.label));
      }}
    >
      <Label className="block font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-[var(--space-3)]">
        <Input
          className="min-h-tap min-w-0 flex-1 rounded-tokenMd border border-border bg-[color:var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] outline-none focus-visible:btn-accent-double-ring-dark"
          placeholder="Type an address (at least 3 letters)"
        />
        <Button
          aria-label="Show suggestions"
          className="min-h-tap min-w-tap shrink-0 rounded-tokenMd border border-border px-[var(--space-5)]"
        >
          ⌄
        </Button>
      </div>
      <Popover className="max-h-[16rem] w-full rounded-tokenMd border border-border bg-[color:var(--color-surface-elevated)] shadow-modal">
        <Text slot="description" className="sr-only">
          Pick an address for {label}.
        </Text>
        <ListBox className="max-h-[220px]">
          {(item: SuggestionItem) => (
            <ListBoxItem
              id={item.id}
              textValue={item.suggestionText}
              className="flex min-h-tap cursor-pointer items-center px-[var(--space-3)] py-[var(--space-3)] hover:bg-[color:var(--color-surface)]"
            >
              {item.suggestionText}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      {trimmedForHint.length >= 3 && !busy && suggestionItems.length === 0 ? (
        <p className="text-sm text-[color:var(--color-text-muted)]" aria-live="polite">
          We currently support Washington, DC addresses only.
        </p>
      ) : null}
      {showUseMyLocation ? (
        <div className="flex flex-wrap items-center gap-[var(--space-4)]">
          <button
            type="button"
            aria-label={`Use my location for ${label}`}
            disabled={locationStatus.kind === "locating"}
            className="inline-flex min-h-tap rounded-tokenMd border border-border px-[var(--space-6)] py-[var(--space-4)] focus-visible:btn-accent-double-ring-dark disabled:opacity-60"
            onClick={() => {
              if (typeof navigator.geolocation === "undefined") {
                const message = "Your browser doesn't support location.";
                setLocationStatus({ kind: "error", message });
                announce(message);
                return;
              }

              if (typeof window !== "undefined" && window.isSecureContext === false) {
                const message =
                  "Location requires a secure connection — try opening this page over HTTPS (or localhost).";
                setLocationStatus({ kind: "error", message });
                announce(message);
                return;
              }

              setLocationStatus({ kind: "locating" });

              navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                  void (async () => {
                    try {
                      const hit = await provider.reverse(
                        coords.longitude,
                        coords.latitude,
                      );
                      onPick(hit);
                      onUserLocationAcquired?.([coords.longitude, coords.latitude]);
                      setLocationStatus({ kind: "idle" });
                      announce(hit.label);
                      setInputValue(hit.label);
                      setHits([]);
                    } catch (error: unknown) {
                      const message =
                        error instanceof ScoutApiError
                          ? error.message
                          : "Couldn't translate that location — try typing an address instead.";
                      setLocationStatus({ kind: "error", message });
                      announce(message);
                    }
                  })();
                },
                (error) => {
                  const message =
                    error.code === error.PERMISSION_DENIED
                      ? "Location access is blocked for this site. Allow it in your browser's site settings, then try again."
                      : error.code === error.POSITION_UNAVAILABLE
                        ? "Your device couldn't determine its location. Try again or type an address."
                        : "Location took too long to respond. Try again.";
                  setLocationStatus({ kind: "error", message });
                  announce(message);
                },
              );
            }}
          >
            Use my location
          </button>
          {locationStatus.kind === "locating" ? (
            <p
              className="text-sm text-[color:var(--color-text-muted)]"
              aria-hidden="true"
            >
              Locating your position…
            </p>
          ) : locationStatus.kind === "error" ? (
            <p
              className="text-sm text-[color:var(--color-danger-text)]"
              aria-hidden="true"
            >
              {locationStatus.message}
            </p>
          ) : busy ? (
            <p
              className="text-sm text-[color:var(--color-text-muted)]"
              aria-hidden="true"
            >
              Searching…
            </p>
          ) : null}
        </div>
      ) : busy ? (
        <p className="text-sm text-[color:var(--color-text-muted)]" aria-hidden="true">
          Searching…
        </p>
      ) : null}
    </ComboBox>
  );
}
