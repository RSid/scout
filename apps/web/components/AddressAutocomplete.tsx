"use client";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import { ScoutApiError, reverseGeocodeNominatim } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
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

type AddrHit = Readonly<{ id: string; label: string; lon: number; lat: number }>;

export type AddressAutocompleteProps = Readonly<{
  id?: string;
  onPickCoordinates: (coords: readonly [number, number]) => void;
}>;

export default function AddressAutocomplete({
  id,
  onPickCoordinates,
}: AddressAutocompleteProps) {
  const announce = useAnnounce();
  const debounceTimer = useRef<number | undefined>(undefined);
  const abortController = useRef<AbortController | undefined>(undefined);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<readonly AddrHit[]>([]);
  const [busy, setBusy] = useState(false);

  const runGeocode = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      abortController.current?.abort();
      abortController.current = undefined;

      if (trimmed.length < 3) {
        setSuggestions([]);
        setBusy(false);
        return;
      }

      const controller = new AbortController();
      abortController.current = controller;
      setBusy(true);

      try {
        const points = await reverseGeocodeNominatim(trimmed, controller.signal);
        const mapped: AddrHit[] = [];

        points.forEach((point, index) => {
          const coords = point.coordinates;
          const lon = coords[0];
          const lat = coords[1];
          if (typeof lon === "number" && typeof lat === "number") {
            mapped.push({
              id: `${index}-${lon.toFixed(4)}-${lat.toFixed(4)}`,
              label: `${trimmed.slice(0, 48)} • ${lon.toFixed(4)}°, ${lat.toFixed(4)}°`,
              lon,
              lat,
            });
          }
        });

        setSuggestions(mapped);
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const fallback =
            error instanceof ScoutApiError
              ? error.message
              : "Geocoder stalled — shorten the typed query.";
          announce(fallback);
          setSuggestions([]);
        }
      } finally {
        setBusy(false);
      }
    },
    [announce],
  );

  useEffect(() => {
    window.clearTimeout(debounceTimer.current);
    setBusy(inputValue.trim().length >= 3);
    debounceTimer.current = window.setTimeout(() => {
      void runGeocode(inputValue);
    }, 520);
    return () => window.clearTimeout(debounceTimer.current);
  }, [inputValue, runGeocode]);

  return (
    <ComboBox
      id={id}
      aria-label="Address autocomplete"
      allowsCustomValue
      items={suggestions}
      inputValue={inputValue}
      onInputChange={(value) => setInputValue(value)}
      className="space-y-[var(--space-3)] text-[color:var(--color-text)]"
      onSelectionChange={(key) => {
        if (key == null) {
          return;
        }
        const match = suggestions.find((item) => String(item.id) === String(key));
        if (!match) {
          return;
        }

        onPickCoordinates([match.lon, match.lat]);
        announce(`Pinned suggestion ${match.label}`);
        window.setTimeout(() => setInputValue(match.label));
      }}
    >
      <Label className="block font-semibold">Places search</Label>
      <div className="flex flex-wrap gap-[var(--space-3)]">
        <Input
          className="min-h-tap flex-[1_1_260px] rounded-tokenMd border border-border bg-[color:var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] outline-none focus-visible:btn-accent-double-ring-dark"
          placeholder="Type three letters to query OSM nominatim"
        />
        <Button className="min-h-tap rounded-tokenMd border border-border px-[var(--space-5)]">
          ⌄
        </Button>
      </div>
      <Popover className="max-h-[16rem] w-full rounded-tokenMd border border-border bg-[color:var(--color-surface-elevated)] shadow-modal">
        <Text slot="description" className="sr-only">
          Each option maps to volunteered coordinates for map wiring.
        </Text>
        <ListBox className="max-h-[220px]">
          {(item: AddrHit) => (
            <ListBoxItem
              id={item.id}
              textValue={item.label}
              className="cursor-pointer px-[var(--space-3)] py-[var(--space-3)] hover:bg-[color:var(--color-surface)]"
            >
              {item.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      <div className="flex flex-wrap items-center gap-[var(--space-4)]">
        <button
          type="button"
          className="inline-flex min-h-tap rounded-tokenMd border border-border px-[var(--space-6)] py-[var(--space-4)] focus-visible:btn-accent-double-ring-dark"
          onClick={() => {
            if (typeof navigator.geolocation === "undefined") {
              announce("Geolocation is not exposed in this browser.");
              return;
            }

            navigator.geolocation.getCurrentPosition(
              ({ coords }) => {
                announce(
                  `Browser anchored ${coords.latitude.toFixed(3)}°, ${coords.longitude.toFixed(3)}°`,
                );
                onPickCoordinates([coords.longitude, coords.latitude]);
              },
              () => {
                announce("Location permission declined.");
              },
            );
          }}
        >
          Use my location on click only
        </button>
        {busy ? (
          <p
            className="text-sm text-[color:var(--color-text-muted)]"
            aria-live="polite"
          >
            Debouncing nominatim…
          </p>
        ) : null}
      </div>
    </ComboBox>
  );
}
