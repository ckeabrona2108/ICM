export type GlazePlugin = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  image: { src: string; width: number; height: number };
  features: string[];
  sources?: { title: string; items: string[]; note?: string }[];
  formats: string[];
  platforms: string[];
  purchaseUrl: string;
};

// Покупка и выдача файлов проходят на lava.top — сайт только ведёт на страницу товара.
export const GLAZE_PLUGINS: GlazePlugin[] = [
  {
    id: "glaze-vocal",
    name: "GLAZE Vocal",
    category: "Для вокала",
    tagline: "Вокал как с дорогой студии — одной ручкой",
    description:
      "Вокальный плагин «всё в одном»: тюн, чистка, компрессия, цвет и пространство в одном окне. Без длинных цепочек и десятка плагинов.",
    image: { src: "/plugins/glaze-vocal.webp", width: 1536, height: 1024 },
    features: [
      "Тюн по тональности и ладу",
      "Чистка грязи и резких пиков",
      "Тепло, сатурация, характер",
      "Компрессия и кнопка AUTO",
      "Пространство и ширина",
      "REC MODE: запись с задержкой ~6 мс"
    ],
    formats: ["VST3", "AU"],
    platforms: ["macOS", "Windows"],
    purchaseUrl: "https://app.lava.top/products/5a3849a3-3112-42c4-b7a0-3f81939eea73"
  },
  {
    id: "glaze-downloader",
    name: "GLAZE Downloader",
    category: "Для битов",
    tagline: "Бит с YouTube — сразу в проект",
    description:
      "Вставьте ссылку на бит — плагин скачает его, определит BPM и тональность, а аудио можно сразу перетащить в DAW.",
    image: { src: "/plugins/glaze-downloader.webp", width: 1672, height: 941 },
    features: [
      "Ссылка или поиск прямо в плагине",
      "Автоопределение BPM и тональности",
      "Drag & Drop в FL Studio, Ableton и др.",
      "Подгонка под темп проекта",
      "Поиск бесшовных лупов"
    ],
    sources: [
      {
        title: "Основные",
        items: ["YouTube и youtu.be", "SoundCloud", "VK — видео и клипы"]
      },
      {
        title: "Музыкальные площадки",
        items: [
          "Bandcamp",
          "Audiomack",
          "Mixcloud",
          "HearThis.at",
          "Jamendo",
          "Яндекс Музыка",
          "Newgrounds",
          "Freesound"
        ],
        note: "Яндекс Музыка может попросить вход в аккаунт или подписку."
      },
      {
        title: "Соцсети и видео",
        items: [
          "TikTok",
          "Instagram",
          "X (Twitter)",
          "Facebook",
          "Reddit",
          "Vimeo",
          "Twitch",
          "Rutube",
          "Одноклассники",
          "Bilibili",
          "Telegram — публичные каналы"
        ]
      }
    ],
    formats: ["VST3"],
    platforms: ["macOS", "Windows"],
    purchaseUrl: "https://app.lava.top/products/359da127-497e-48bd-ad0e-897a9273312d"
  }
];
