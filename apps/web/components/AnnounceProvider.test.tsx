import type { ReactNode } from "react";

import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnnounceProvider, useAnnounce } from "./a11y/AnnounceProvider";

function AnnouncerHarness(): ReactNode {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce("Route updated.")}>
      announce route
    </button>
  );
}

describe("AnnounceProvider", () => {
  it("surfaces messages through polite live region routing", async () => {
    const { container } = render(
      <AnnounceProvider>
        <AnnouncerHarness />
      </AnnounceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /announce route/i }));

    await waitFor(() =>
      expect(screen.getByRole("status", { hidden: false })).toHaveTextContent(
        "Route updated.",
      ),
    );

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
