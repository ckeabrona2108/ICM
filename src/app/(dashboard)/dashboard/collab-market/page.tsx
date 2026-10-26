import { redirect } from "next/navigation";

import { COLLAB_MARKET_ENABLED } from "@/lib/feature-flags";

export default function CollabMarketPage() {
  redirect(COLLAB_MARKET_ENABLED ? "/dashboard/community?view=collaborations" : "/dashboard");
}
