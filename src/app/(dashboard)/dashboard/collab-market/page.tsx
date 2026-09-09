import { redirect } from "next/navigation";

export default function CollabMarketPage() {
  redirect("/dashboard/community?view=collaborations");
}
