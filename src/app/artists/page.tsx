import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: { absolute: "Collab Market — ICECREAMMUSIC" },
  description: "Collab Market ICECREAMMUSIC.",
  alternates: { canonical: "/dashboard/community" }
};

export default function ArtistsPage() {
  redirect("/dashboard/community");
}
