import type { Metadata } from "next";

import { PublicSectionUnavailable } from "@/components/layout/section-unavailable";

export const metadata: Metadata = {
  title: "Аналитика",
  robots: { index: false, follow: false }
};

export default function AnalyticsUnavailablePage() {
  return <PublicSectionUnavailable />;
}
