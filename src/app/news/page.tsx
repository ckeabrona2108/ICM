import type { Metadata } from "next";
import Link from "next/link";

import { NewsListClient } from "@/components/news/news-list-client";

export const metadata: Metadata = {
  title: "Новости музыкальной индустрии и сервиса",
  description:
    "Новости ICECREAMMUSIC: обновления дистрибуции, аналитики, продвижения и инструментов для артистов.",
  alternates: {
    canonical: "/news"
  },
  openGraph: {
    type: "website",
    url: "/news",
    title: "Новости музыкальной индустрии и сервиса",
    description:
      "Обновления дистрибуции, аналитики, продвижения и инструментов ICECREAMMUSIC для артистов."
  }
};

export default function NewsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-[30px] font-semibold text-white">Новости</h1>
      <p className="mt-2 text-[14px] text-white/65">
        Обновления сервиса, важные уведомления и анонсы новых возможностей.{" "}
        <Link href="/guides" className="text-[#c4b5fd] underline-offset-4 hover:underline">
          Гайды для артистов →
        </Link>
      </p>

      <div className="mt-6">
        <NewsListClient />
      </div>
    </main>
  );
}
