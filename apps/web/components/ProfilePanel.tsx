"use client";

import * as Dialog from "@radix-ui/react-dialog";

import ProfileCategoryFields from "@/components/ProfileCategoryFields";
import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import { useProfile } from "@/lib/profile";

export default function ProfilePanel() {
  const { categories, selections, toggle, resetToDefaults, persist, isReady } =
    useProfile();
  const announce = useAnnounce();

  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex min-h-tap shrink-0 items-center justify-center rounded-tokenMd bg-accent px-[var(--space-5)] py-[var(--space-4)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark">
        Accessibility profile
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgba(34,28,20,0.55)] backdrop-blur-sm dark:bg-[rgba(10,12,22,0.65)]" />
        <Dialog.Content
          aria-describedby="profile-dialog-description"
          className="fixed left-[50%] top-[50%] z-[var(--z-modal)] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-tokenLg bg-[color:var(--color-surface-elevated)] p-[var(--space-6)] shadow-modal outline-none dark:border dark:border-[color:var(--color-border)]"
        >
          <div className="flex items-start justify-between gap-[var(--space-4)]">
            <Dialog.Title className="text-xl font-semibold text-[color:var(--color-text)]">
              Accessibility profile
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close profile dialog"
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-tokenSm border border-border text-[color:var(--color-text)] focus-visible:btn-accent-double-ring-dark"
            >
              ×
            </Dialog.Close>
          </div>
          <p
            id="profile-dialog-description"
            className="mt-[var(--space-4)] text-sm text-[color:var(--color-text-muted)]"
          >
            Decide which volunteered categories tint the corridor map and list layouts.
          </p>
          {isReady ? (
            <>
              <div className="mt-[var(--space-6)] max-h-[50vh] space-y-[var(--space-4)] overflow-y-auto border border-border px-[var(--space-4)] py-[var(--space-4)] rounded-tokenMd">
                <ProfileCategoryFields
                  categories={categories}
                  selections={selections}
                  onToggle={(id, value) => toggle(id, value)}
                />
              </div>
              <div className="mt-[var(--space-6)] flex flex-wrap gap-[var(--space-3)]">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="inline-flex min-h-tap justify-center rounded-tokenMd bg-accent px-[var(--space-5)] py-[var(--space-4)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark"
                    onClick={() => {
                      persist();
                      announce("Accessibility profile saved to this browser.");
                    }}
                  >
                    Save
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  className="inline-flex min-h-tap justify-center rounded-tokenMd border border-border px-[var(--space-5)] py-[var(--space-4)] font-semibold text-[color:var(--color-text)] focus-visible:btn-accent-double-ring-dark"
                  onClick={() => {
                    resetToDefaults();
                    persist();
                    announce("Category toggles restored to Scout defaults.");
                  }}
                >
                  Reset to defaults
                </button>
              </div>
            </>
          ) : (
            <p role="status" className="mt-[var(--space-5)]">
              Loading category catalog…
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
