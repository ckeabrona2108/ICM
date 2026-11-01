import { KaraokeStudio } from "@/components/karaoke/karaoke-studio";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function DashboardKaraokePage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Караоке (TTML)"
        description="Синхронизируйте текст с треком и скачайте .ttml или .lrc для площадок. Трек не покидает браузер."
      />
      <div className="max-w-4xl">
        <KaraokeStudio />
      </div>
    </DashboardShell>
  );
}
