/** Публичные тарифы ICM (как на лендинге) — единый источник для сайта и ЛК */

export type IcmTariffIconId = "mic2" | "camera" | "dollar";

export interface IcmTariffTier {
  id: string;
  badge: number;
  title: string;
  icon: IcmTariffIconId;
  iconColor: string;
  description: string;
  aiGiftDescription?: string;
  promoBadge?: {
    label: string;
    tone: "emerald" | "violet";
  };
  price: string;
  period: string;
  features: string[];
  footer: string;
  button: { label: string; className: string };
  popular?: boolean;
}

export const ICM_TARIFFS: IcmTariffTier[] = [
  {
    id: "standard",
    badge: 153,
    title: "STANDARD",
    icon: "mic2",
    iconColor: "#a78bfa",
    description: "🎧 Твой первый шаг в индустрию — просто, быстро, без стресса.",
    price: "₽550",
    period: "/ Мес",
    features: [
      "🎵 2 релиза в месяц — идеально для старта",
      "🚀 Доставка на площадки за 5 дней",
      "🌍 Твоя музыка появится на всех стримингах"
    ],
    footer: "💡 Начни с малого — вырасти в большое.",
    button: {
      label: "🎧 Войти в игру",
      className:
        "bg-[#22c55e] hover:bg-[#16a34a] shadow-[0_8px_24px_-8px_rgba(34,197,94,0.6)]"
    }
  },
  {
    id: "pro",
    badge: 230,
    title: "PRO",
    icon: "camera",
    iconColor: "#fb923c",
    description: "🔥 Больше релизов — больше шансов залететь. Для тех, кто настроен на результат.",
    aiGiftDescription:
      "🎁 1 000 AI-токенов в подарок. Генерируйте изображения, видео, аудио и общайтесь с AI без дополнительных расходов в первый месяц.",
    promoBadge: {
      label: "🎁 +1 000 AI-токенов",
      tone: "emerald"
    },
    price: "₽990",
    period: "/ Мес",
    features: [
      "🎵 До 6 релизов в месяц — масштабируйся",
      "⚡ Быстрая выгрузка — до 3 дней",
      "🤝 Поддержка на каждом этапе"
    ],
    footer: "🎯 Делай музыку чаще — расти быстрее.",
    button: {
      label: "🔥 Запустить релиз",
      className:
        "bg-[#f97316] hover:bg-[#ea580c] shadow-[0_8px_24px_-8px_rgba(249,115,22,0.6)]"
    },
    popular: true
  },
  {
    id: "enterprise",
    badge: 417,
    title: "ENTERPRISE",
    icon: "dollar",
    iconColor: "#7b61ff",
    description: "👑 Максимум возможностей для серьёзных артистов. Уровень, где начинается настоящий рост.",
    aiGiftDescription:
      "🎁 2 500 AI-токенов в подарок. Максимальный бонус для профессиональной работы с AI Студией: больше генераций, больше возможностей, больше результата.",
    promoBadge: {
      label: "🔥 +2 500 AI-токенов",
      tone: "violet"
    },
    price: "₽1990",
    period: "/ Мес",
    features: [
      "♾️ Безлимитные релизы",
      "⚡ Выгрузка от 24 часов",
      "🛡️ Приоритетная поддержка",
      "✨ Доп. функции для продвижения"
    ],
    footer: "💎 Делай сколько хочешь — мы всё вывезем.",
    button: {
      label: "💿 Выпустить трек",
      className:
        "bg-[#7b61ff] hover:bg-[#6a4ff0] shadow-[0_8px_24px_-8px_rgba(123,97,255,0.6)]"
    }
  }
];
