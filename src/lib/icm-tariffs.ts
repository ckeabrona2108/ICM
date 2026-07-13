/** Публичные тарифы ICM (как на лендинге) — единый источник для сайта и ЛК */

import {
  getSubscriptionTariffConfig,
  type SubscriptionBillingPeriod
} from "@/lib/subscription-billing";

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
  secondaryPrice?: string;
  savingsNote?: string;
  billingBadge?: {
    label: string;
    tone: "emerald" | "violet";
  };
  features: string[];
  footer: string;
  button: { label: string; className: string };
  popular?: boolean;
}

function formatRub(value: number): string {
  return `₽${new Intl.NumberFormat("ru-RU").format(value)}`;
}

export function getIcmTariffs(
  billingPeriod: SubscriptionBillingPeriod = "monthly"
): IcmTariffTier[] {
  const standardTariff = getSubscriptionTariffConfig("standard", billingPeriod);
  const proTariff = getSubscriptionTariffConfig("pro", billingPeriod);
  const enterpriseTariff = getSubscriptionTariffConfig("enterprise", billingPeriod);

  if (!standardTariff || !proTariff || !enterpriseTariff) {
    return [];
  }

  return [
    {
    id: "standard",
    badge: 153,
    title: "STANDARD",
    icon: "mic2",
    iconColor: "#a78bfa",
    description: "🎧 Твой первый шаг в индустрию — просто, быстро, без стресса.",
    price: formatRub(standardTariff.amountRub),
    period: billingPeriod === "yearly" ? "/ Год" : "/ Мес",
    secondaryPrice:
      billingPeriod === "yearly"
        ? `или ${formatRub(standardTariff.yearlyMonthlyEquivalentRub)}/мес`
        : undefined,
    savingsNote:
      billingPeriod === "yearly"
        ? `Экономия ${formatRub(standardTariff.yearlySavingsRub)}`
        : undefined,
    billingBadge:
      billingPeriod === "yearly"
        ? { label: standardTariff.yearlyBadge, tone: "emerald" }
        : undefined,
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
      billingPeriod === "yearly"
        ? "🎁 5 000 AI-токенов в подарок"
        : "🎁 1 000 AI-токенов в подарок. Генерируйте изображения, видео, аудио и общайтесь с AI без дополнительных расходов в первый месяц.",
    promoBadge: {
      label: billingPeriod === "yearly" ? "🎁 5 000 AI-токенов" : "🎁 +1 000 AI-токенов",
      tone: "emerald"
    },
    price: formatRub(proTariff.amountRub),
    period: billingPeriod === "yearly" ? "/ Год" : "/ Мес",
    secondaryPrice:
      billingPeriod === "yearly"
        ? `или ${formatRub(proTariff.yearlyMonthlyEquivalentRub)}/мес`
        : undefined,
    savingsNote:
      billingPeriod === "yearly"
        ? `Экономия ${formatRub(proTariff.yearlySavingsRub)}`
        : undefined,
    billingBadge:
      billingPeriod === "yearly"
        ? { label: proTariff.yearlyBadge, tone: "violet" }
        : undefined,
    features: [
      "🎵 До 6 релизов в месяц — масштабируйся",
      "⚡ Выгрузка до 3-х дней",
      "🎨 Создавай обложки и арты",
      "🎵 Генерируй идеи и тексты песен",
      "🤖 Общайся с AI без доплат",
      "⚡ Доступ ко всем AI-инструментам"
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
      billingPeriod === "yearly"
        ? "🔥 20 000 AI-токенов включено"
        : "🎁 2 500 AI-токенов в подарок. Максимальный бонус для профессиональной работы с AI Студией: больше генераций, больше возможностей, больше результата.",
    promoBadge: {
      label: billingPeriod === "yearly" ? "🔥 20 000 AI-токенов" : "🔥 +2 500 AI-токенов",
      tone: "violet"
    },
    price: formatRub(enterpriseTariff.amountRub),
    period: billingPeriod === "yearly" ? "/ Год" : "/ Мес",
    secondaryPrice:
      billingPeriod === "yearly"
        ? `или ${formatRub(enterpriseTariff.yearlyMonthlyEquivalentRub)}/мес`
        : undefined,
    savingsNote:
      billingPeriod === "yearly"
        ? `Экономия ${formatRub(enterpriseTariff.yearlySavingsRub)}`
        : undefined,
    billingBadge:
      billingPeriod === "yearly"
        ? { label: enterpriseTariff.yearlyBadge, tone: "violet" }
        : undefined,
    features: [
      "♾️ Безлимитные релизы",
      "⚡ Выгрузка от 24 часов",
      "🛡️ Приоритетная поддержка",
      "🎨 Генерация изображений",
      "🎵 AI для музыки",
      "🎬 Генерация видео",
      "🤖 Общение с AI без доплат"
    ],
    footer: "💎 Делай сколько хочешь — мы всё вывезем.",
    button: {
      label: "💿 Выпустить трек",
      className:
        "bg-[#7b61ff] hover:bg-[#6a4ff0] shadow-[0_8px_24px_-8px_rgba(123,97,255,0.6)]"
    }
  }
  ];
}

export const ICM_TARIFFS: IcmTariffTier[] = getIcmTariffs("monthly");
