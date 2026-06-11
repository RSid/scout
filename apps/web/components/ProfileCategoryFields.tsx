"use client";

import * as Checkbox from "@radix-ui/react-checkbox";

import type { ApiCategory } from "@/lib/api";
import { kindObstacleLabel, kindSupportLabel } from "@/lib/i18n/messages";

type Props = Readonly<{
  categories: readonly ApiCategory[];
  selections: Readonly<Record<string, boolean | undefined>>;
  onToggle: (id: string, value: boolean) => void;
}>;

export default function ProfileCategoryFields({
  categories,
  selections,
  onToggle,
}: Props) {
  return (
    <fieldset className="space-y-[var(--space-3)]">
      <legend className="sr-only">Accessibility categories to show on the map</legend>
      {categories.map((category) => {
        const checked = selections[category.id] ?? category.default_enabled;
        const kindLabel =
          category.kind === "obstacle" ? kindObstacleLabel() : kindSupportLabel();
        return (
          <label
            htmlFor={`cat-${category.id}`}
            key={category.id}
            className="flex items-start gap-[var(--space-3)] text-[color:var(--color-text)]"
          >
            <Checkbox.Root
              checked={checked}
              onCheckedChange={(value) => {
                const next =
                  typeof value === "boolean"
                    ? value
                    : value === "indeterminate"
                      ? !checked
                      : checked;

                onToggle(category.id, next);
              }}
              id={`cat-${category.id}`}
              className="flex h-tap min-h-tap w-tap shrink-0 items-center justify-center rounded-tokenSm border border-border bg-[color:var(--color-surface)] text-accent data-[state=checked]:border-transparent data-[state=checked]:bg-accent data-[state=checked]:text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark"
              aria-labelledby={`cat-${category.id}-title`}
              aria-describedby={`cat-${category.id}-kind cat-${category.id}-hint`}
            >
              <Checkbox.Indicator>
                <span
                  aria-hidden
                  className="text-[length:var(--font-size-xs)] font-bold leading-none"
                >
                  ✓
                </span>
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span>
              <span className="flex items-center gap-[var(--space-2)] font-semibold">
                <span id={`cat-${category.id}-title`}>{category.label}</span>
                {/* Kind as text (not color alone) so obstacle/aid is conveyed to
                    everyone — NF-A11Y-06. Also part of the checkbox's a11y name. */}
                <span
                  id={`cat-${category.id}-kind`}
                  className="rounded-tokenSm bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-[length:var(--font-size-xs)] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]"
                >
                  {kindLabel}
                </span>
              </span>
              <span
                id={`cat-${category.id}-hint`}
                className="text-sm text-[color:var(--color-text-muted)]"
              >
                {category.description}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
