"use client";

import { useRouter } from "next/navigation";

import ProfilePanel from "@/components/ProfilePanel";

/** Home-page entry point: set up the accessibility profile, then go straight to the planner. */
export default function ConfigureNeedsButton() {
  const router = useRouter();

  return (
    <ProfilePanel
      triggerLabel="Configure accessibility needs"
      triggerVariant="secondary"
      onSave={() => router.push("/plan")}
    />
  );
}
