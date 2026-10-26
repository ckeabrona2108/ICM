export type GlazePlugin = {
  id: string;
  name: string;
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
    tagline: "Вокал как с дорогой студии — одной ручкой",
    description:
      "Вокальный плагин «всё в одном»: тюн, чистка, компрессия, цвет и пространство в одном окне. Без длинных цепочек и десятка плагинов.",
    image: { src: "/plugins/glaze-vocal.webp", width: 1536, height: 1024 },
    features: [
      "Тюн по тональности и ладу — от естественного до модного эффекта",
      "Чистка грязи и резких пиков, читаемость и присутствие",
      "Тепло, сатурация и характер — вокал выходит вперёд в миксе",
      "Компрессия и контроль динамики, кнопка AUTO",
      "REC MODE с задержкой ~6 мс — можно писаться прямо через плагин"
    ],
    formats: ["VST3", "AU"],
    platforms: ["macOS", "Windows"],
    purchaseUrl: "https://app.lava.top/products/5a3849a3-3112-42c4-b7a0-3f81939eea73"
  },
  {
    id: "glaze-downloader",
    name: "GLAZE Downloader",
    tagline: "Бит с YouTube — сразу в проект",
    description:
      "Вставляешь ссылку на бит, плагин скачивает его, определяет BPM и тональность, и ты перетаскиваешь аудио прямо в DAW.",
    image: { src: "/plugins/glaze-downloader.webp", width: 1672, height: 941 },
    features: [
      "Импорт по ссылке или поиск бита прямо в плагине",
      "Автоопределение BPM и тональности",
      "Drag & Drop прямо в FL Studio, Ableton и другие DAW",
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
