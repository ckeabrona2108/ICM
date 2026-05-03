import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";

const news = [
  {
    id: "n1",
    title: "Обновлён процесс модерации релизов",
    body: "С 27 апреля 2026 года проверка UPC и ISRC выполняется до отправки материалов на стриминговые площадки. Это снижает число отклонений со стороны DSP.",
    date: "27.04.2026"
  },
  {
    id: "n2",
    title: "Новый SLA по обращениям",
    body: "Заявки на выплаты и запросы по верификации обрабатываются в течение 24 рабочих часов. Срочные случаи отмечайте в тикете.",
    date: "26.04.2026"
  },
  {
    id: "n3",
    title: "Обновление раздела FAQ",
    body: "В справке появились ответы про территориальные ограничения дистрибуции и опцию раннего старта релиза в России.",
    date: "25.04.2026"
  }
];

export default function AdminNewsPage() {
  return (
    <DashboardShell className="pb-10">
      <PageHeader
        title="Новости"
        description="Служебные объявления и важные изменения в панели модерации — для команды администраторов."
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {news.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5 shadow-[0_12px_36px_-22px_rgba(0,0,0,0.9)]"
          >
            <p className="text-[13px] font-medium text-[#a78bfa]/90">{item.date}</p>
            <h2 className="mt-2 text-[18px] font-semibold leading-snug text-white sm:text-[19px]">
              {item.title}
            </h2>
            <p className="mt-3 text-[15px] font-medium leading-relaxed text-white/72">{item.body}</p>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
