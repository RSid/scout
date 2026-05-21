import * as scoutApi from "@/lib/api";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@testing-library/react";

import { AnnounceProvider } from "./a11y/AnnounceProvider";
import AddressAutocomplete from "./AddressAutocomplete";

describe("AddressAutocomplete", () => {
  it("pipes picked coordinates through onPickCoordinates", async () => {
    // MOCK: keep debounced RAC flow off the public Nominatim endpoint in CI.
    const geocodeSpy = vi
      .spyOn(scoutApi, "reverseGeocodeNominatim")
      .mockResolvedValue([{ type: "Point", coordinates: [-77.0369, 38.9072] }]);

    try {
      const onPickCoordinates = vi.fn();
      const user = userEvent.setup({ delay: null });

      render(
        <AnnounceProvider>
          <AddressAutocomplete onPickCoordinates={onPickCoordinates} />
        </AnnounceProvider>,
      );

      const combobox = screen.getByRole("combobox", { name: /address autocomplete/i });
      await user.type(combobox, "Dupont Circle");

      await waitFor(() => expect(geocodeSpy).toHaveBeenCalled(), { timeout: 6000 });

      await user.click(screen.getByRole("button", { name: /show suggestions/i }));

      const option = await screen.findByRole(
        "option",
        { name: /Dupont Circle/i },
        { timeout: 6000 },
      );

      await user.click(option);

      expect(onPickCoordinates).toHaveBeenCalledWith([-77.0369, 38.9072]);
    } finally {
      geocodeSpy.mockRestore();
    }
  });
});
