import type { CabinetRelease, CabinetReleaseStatus } from "@/lib/cabinet-types";

export const cabinetReleases: CabinetRelease[] = [
  {
    id: "rel_3",
    number: 3,
    coverUrl: "/hero/barceton.png",
    title: "BARCETON",
    artist: "Ckeabrona",
    upc: "5063945423292",
    isrc: "RUTBM2600041",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-21",
    preorderDate: "10.11.1111",
    releaseDate: "10.11.1111",
    startDate: "10.11.1111",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "R&B",
    status: "changes_required",
    paid: true,
    tracks: [],
    moderationReturnedAt: "2026-04-26 14:22",
    moderationRemarks: [
      {
        section: "Релиз",
        field: "cover",
        message: "Обложка не соответствует требованиям по качеству. Загрузите финальный вариант 1400×1400+."
      },
      {
        section: "Трек 1",
        field: "tracks.0.trackPersons",
        message: "Для роли «Автор текста» укажите фактические имя и фамилию."
      }
    ]
  },
  {
    id: "rel_1",
    number: 1,
    coverUrl: "/hero/drop.png",
    title: "DROP",
    artist: "Ckeabrona",
    upc: "5063945423293",
    isrc: "RUTBM2600042",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-18",
    preorderDate: "10.11.1111",
    releaseDate: "10.11.1111",
    startDate: "10.11.1111",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "EDM",
    status: "changes_required",
    paid: false,
    tracks: [],
    moderationReturnedAt: "2026-04-24 09:10",
    moderationRemarks: [
      {
        section: "Релиз",
        field: "preorderDate",
        message: "Дата предзаказа должна быть не позже даты старта."
      }
    ]
  },
  {
    id: "rel_u1",
    number: 8,
    coverUrl: "/hero/studio.png",
    title: "WAITING PAYMENT",
    artist: "Ckeabrona",
    upc: "5063945423300",
    isrc: "",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-27",
    preorderDate: "—",
    releaseDate: "2026-05-01",
    startDate: "2026-05-01",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "Pop",
    status: "distributed",
    paid: false,
    tracks: []
  },
  {
    id: "rel_2",
    number: 2,
    coverUrl: "/hero/love.png",
    title: "LOVE LANGUAGE",
    artist: "Ckeabrona",
    upc: "5063945423294",
    isrc: "RUTBM2600043",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-16",
    preorderDate: "10.11.1111",
    releaseDate: "10.11.1111",
    startDate: "10.11.1111",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "K-Pop",
    status: "changes_required",
    paid: true,
    tracks: [],
    moderationReturnedAt: "2026-04-23 18:42",
    moderationRemarks: [
      {
        section: "Трек 1",
        field: "tracks.0.isrc",
        message: "ISRC заполнен в некорректном формате."
      }
    ]
  },
  {
    id: "rel_4",
    number: 4,
    coverUrl: "/hero/drop.png",
    title: "Тестовый релиз",
    artist: "Артист",
    upc: "",
    isrc: "RUTBM2600044",
    label: "ICECREAMMUSIC",
    createdAt: "2024-07-25",
    preorderDate: "10.11.1111",
    releaseDate: "2222-02-22",
    startDate: "10.11.1111",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "Blues",
    status: "moderation",
    paid: true,
    tracks: [],
    moderationStep: 3,
    moderationStarted: true,
    releaseCatalogId: "3566",
    moderationStatusTag: "Модерация площадок",
    priority: true
  },
  // drafts
  {
    id: "rel_d1",
    number: 5,
    coverUrl: "/hero/live.png",
    title: "LOST CASSETTES",
    artist: "Ckeabrona",
    upc: "5063945423292",
    isrc: "",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-21",
    preorderDate: "—",
    releaseDate: "2026-04-17",
    startDate: "2026-04-17",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "Hip-Hop / Rap",
    status: "draft",
    paid: false,
    tracks: []
  },
  {
    id: "rel_d2",
    number: 6,
    coverUrl: "/hero/vibes.png",
    title: "MIDNIGHT VIBES",
    artist: "Ckeabrona",
    upc: "",
    isrc: "",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-20",
    preorderDate: "—",
    releaseDate: "—",
    startDate: "—",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "Lo-Fi",
    status: "draft",
    paid: false,
    tracks: []
  },
  // changes required
  {
    id: "rel_c1",
    number: 7,
    coverUrl: "/hero/love.png",
    title: "AFTERHOURS",
    artist: "Ckeabrona",
    upc: "5063945423298",
    isrc: "RUTBM2600045",
    label: "ICECREAMMUSIC",
    createdAt: "2026-04-15",
    preorderDate: "—",
    releaseDate: "2026-05-12",
    startDate: "2026-05-12",
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 48,
    genre: "Phonk",
    status: "changes_required",
    paid: true,
    tracks: [],
    moderationReturnedAt: "2026-04-27 11:05",
    moderationRemarks: [
      {
        section: "Релиз",
        field: "platforms",
        message: "Для релиза без аудио уберите стриминговые площадки или добавьте аудиофайлы."
      },
      {
        section: "Трек 1",
        field: "tracks.0.copyrightPct",
        message: "Укажите корректный процент авторских прав (0–100)."
      }
    ]
  }
];

export const cabinetUser = {
  name: "Олег",
  plan: "STANDARD",
  balance: "0.00 ₽",
  verified: true
};

export function countByStatus(status: CabinetReleaseStatus) {
  return cabinetReleases.filter((r) => r.status === status).length;
}

export function getCabinetReleaseById(id: string): CabinetRelease | undefined {
  return cabinetReleases.find((r) => r.id === id);
}
