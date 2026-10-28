import Link from "next/link";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SnippetStudio } from "@/components/snippet-studio/snippet-studio";

import { VideoSnippetsGenerator } from "./video-snippets-generator";

type VideoSnippetSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function VideoSnippetsPage({
  searchParams
}: {
  searchParams?: VideoSnippetSearchParams;
}) {
  const title = firstParam(searchParams?.title);
  const artist = firstParam(searchParams?.artist);
  const coverUrl = firstParam(searchParams?.cover);
  const audioUrl = firstParam(searchParams?.audio);
  const isClassic = firstParam(searchParams?.editor) === "classic";

  return (
    <DashboardShell>
      <PageHeader
        title={isClassic ? "Видео-сниппеты" : "Snippet Studio"}
        caption={
          <>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/8 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-200">
              beta
            </span>
            {isClassic ? (
              <>
                <span className="text-white/62">V1· Classic</span>
                <Link href="/dashboard/video-snippets" className="text-[#b3a6ff] hover:text-[#d6ceff]">
                  Новая студия →
                </Link>
              </>
            ) : (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                MP4 · рендер на устройстве
              </span>
            )}
          </>
        }
        className="mb-4 gap-3 [&_h1]:text-[28px] sm:[&_h1]:text-[32px] [&_p]:mt-1 [&_p]:max-w-2xl [&_p]:text-[14px]"
        description={
          isClassic
            ? "Создавай стильные сниппеты, Shorts и Reels для продвижения релизов за минуту. Загрузи трек, выбери обложку — всё остальное мы сделаем автоматически."
            : "Выбери релиз — обложка, трек и смарт-линк подставятся сами. Шаблон, живой фон и эффекты на звук — и готовый MP4 для Reels, TikTok и VK Клипов."
        }
      />
      {isClassic ? (
        <VideoSnippetsGenerator
          initialSeed={{
            title,
            artist,
            coverUrl,
            audioUrl
          }}
        />
      ) : (
        <SnippetStudio initialSeed={{ title, artist, coverUrl, audioUrl }} />
      )}
    </DashboardShell>
  );
}
