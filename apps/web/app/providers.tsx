"use client";

import { AnnounceProvider } from "@/components/a11y/AnnounceProvider";
import SkipLink from "@/components/a11y/SkipLink";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import OnboardingModal from "@/components/OnboardingModal";
import { ProfileProvider } from "@/lib/profile";

export default function Providers({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProfileProvider>
      <AnnounceProvider>
        <>
          <SkipLink />
          <DisclaimerBanner />
          <OnboardingModal />
          {children}
        </>
      </AnnounceProvider>
    </ProfileProvider>
  );
}
