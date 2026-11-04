// Quick links to the parts of the profile page, so it is clear what is where.
const SECTIONS = [
  { id: "profile", label: "Профиль", hint: "имя, аватар, договор" },
  { id: "security", label: "Email и пароль", hint: "смена и восстановление" },
  { id: "linked-accounts", label: "Способы входа", hint: "Яндекс, VK, Telegram" },
  { id: "notifications", label: "Уведомления", hint: "куда приходят" },
  { id: "subscription", label: "Подписка", hint: "тариф и покупки" }
];

export function ProfileSectionNav() {
  return (
    <nav aria-label="Разделы профиля" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="flex flex-col rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 transition-colors hover:border-white/[0.18] hover:bg-white/[0.07]"
            >
              <span className="text-[14px] font-semibold text-white">{section.label}</span>
              <span className="text-[12px] text-white/45">{section.hint}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
