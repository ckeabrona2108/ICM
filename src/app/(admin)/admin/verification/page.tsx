const queue = [
  { id: "ver_001", entity: "POVOD", type: "Артист", status: "Ожидает проверки", createdAt: "27.04.2026 19:12" },
  { id: "ver_002", entity: "813Atelier", type: "Лейбл", status: "Ожидает проверки", createdAt: "27.04.2026 17:48" },
  { id: "ver_003", entity: "Nova Echo", type: "Артист", status: "Нужны документы", createdAt: "27.04.2026 14:05" }
];

export default function AdminVerificationPage() {
  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Верификация</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Очередь подтверждения артистов, лейблов и прав на контент.
      </p>

      <div className="mt-6 space-y-3">
        {queue.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-white/[0.06] bg-[#161720] px-5 py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-medium text-white">
                {item.entity} · {item.type}
              </p>
              <span className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/80">
                {item.status}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-white/45">{item.createdAt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
