import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";

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

  return (
    <DashboardShell>
      <PageHeader
        title="Видео-сниппеты"
        caption={
          <>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/8 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-200">
              beta
            </span>
            <span className="text-white/62">V1· Classic</span>
          </>
        }
        className="mb-4 gap-3 [&_h1]:text-[28px] sm:[&_h1]:text-[32px] [&_p]:mt-1 [&_p]:max-w-2xl [&_p]:text-[14px]"
        description="Создавай стильные сниппеты, Shorts и Reels для продвижения релизов за минуту. Загрузи трек, выбери обложку — всё остальное мы сделаем автоматически."
      />
      <VideoSnippetsGenerator
        initialSeed={{
          title,
          artist,
          coverUrl,
          audioUrl
        }}
      />
    </DashboardShell>
  );
}
