import type { Metadata } from "next";

import { PublicSectionUnavailable } from "@/components/layout/section-unavailable";

export const metadata: Metadata = {
  title: "Beat Market",
  robots: { index: false, follow: false }
};

export default function BeatsMarketUnavailablePage() {
  return <PublicSectionUnavailable />;
}
