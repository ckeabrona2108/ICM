const faq = [
  {
    q: "Почему релиз не появился в “Все релизы”?",
    a: "Релизы в статусе “На модерации” отображаются только в разделе “Релизы” админки и в разделе “Модерация” кабинета."
  },
  {
    q: "Когда можно одобрить релиз?",
    a: "После заполнения обязательных полей и проверки прав. Для принятия требуется валидный UPC."
  },
  {
    q: "Как отклонить релиз?",
    a: "Нажмите кнопку с красным крестиком и укажите понятную причину отклонения для артиста."
  }
];

export default function AdminFaqPage() {
  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">FAQ</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Краткие ответы для модераторов и администраторов.
      </p>

      <div className="mt-6 space-y-3">
        {faq.map((item) => (
          <div
            key={item.q}
            className="rounded-2xl border border-white/[0.06] bg-[#161720] px-5 py-4"
          >
            <h2 className="text-[15px] font-medium leading-snug text-white">{item.q}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
