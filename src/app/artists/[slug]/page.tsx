import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "Collab Market — ICECREAMMUSIC" },
    description: "Collab Market ICECREAMMUSIC."
  };
}

export default async function ArtistPage() {
  redirect("/dashboard/community");
}
