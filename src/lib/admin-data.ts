import type { ModerationRemark } from "@/lib/api/contracts";

export type AdminReleaseStatus =
  | "draft"
  | "pending_verification"
  | "moderation"
  | "approved"
  | "changes_required"
  | "rejected";
export type AdminRoleFilter = "all" | "artist" | "label" | "studio";

export interface AdminTrackDetails {
  id: string;
  title: string;
  subtitle: string;
  isrc: string;
  partnerCode: string;
  artists: string;
  feat: string;
  musicAuthor: string;
  lyricsAuthor: string;
  copyright: string;
  neighboringRights: string;
  language: string;
  explicit: boolean;
  live: boolean;
  cover: boolean;
  remix: boolean;
  instrumental: boolean;
  prereleaseStart: string;
  instantGratification: string;
  focusTrack: boolean;
}

export interface AdminReleaseDetails {
  id: string;
  role: Exclude<AdminRoleFilter, "all">;
  title: string;
  subtitle: string;
  coverUrl: string;
  coverUrlCandidates?: string[];
  label: string;
  upc: string;
  preorderDate: string;
  releaseDate: string;
  startDate: string;
  territories: string;
  territoriesCount: number;
  platformsCount: number;
  genre: string;
  status: AdminReleaseStatus;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  moderationComment?: string;
  moderationRemarks?: ModerationRemark[];
  moderationReturnedAt?: string;
  priority?: boolean;
  paid: boolean;
  paymentKind?: "paid" | "subscription" | "unpaid";
  paymentLabel?: string;
  paymentUsage?: string | null;
  paymentPlan?: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  metadataLanguage: string;
  releaseType: string;
  artists: string;
  feat: string;
  countryStartEarly: boolean;
  realTimeDelivery: boolean;
  yandexDate: string;
  previewUrl: string;
  tracks: AdminTrackDetails[];
}

export const adminReleases: AdminReleaseDetails[] = [
  {
    id: "adm_rel_001",
    role: "artist",
    title: "Связаны",
    subtitle: "prod. by MacQueenBeats",
    coverUrl: "/hero/barceton.png",
    label: "813Atelier",
    upc: "",
    preorderDate: "15.04.2026",
    releaseDate: "29.04.2026",
    startDate: "29.04.2026",
    territories: "Все страны",
    territoriesCount: 244,
    platformsCount: 56,
    genre: "Русский рэп",
    status: "moderation",
    paid: false,
    metadataLanguage: "Russian",
    releaseType: "single",
    artists: "POVOD",
    feat: "Полумягкие",
    countryStartEarly: true,
    realTimeDelivery: false,
    yandexDate: "15.04.2026",
    previewUrl: "/hero/barceton.png",
    tracks: [
      {
        id: "trk_001",
        title: "Связаны",
        subtitle: "prod. by MacQueenBeats",
        isrc: "",
        partnerCode: "",
        artists: "POVOD",
        feat: "Полумягкие",
        musicAuthor: "Mac Queen",
        lyricsAuthor: "Владислав Поводырев",
        copyright: "100%",
        neighboringRights: "100%",
        language: "Russian",
        explicit: true,
        live: false,
        cover: false,
        remix: false,
        instrumental: false,
        prereleaseStart: "00:00",
        instantGratification: "-",
        focusTrack: false
      }
    ]
  },
  {
    id: "adm_rel_002",
    role: "label",
    title: "Ночной Вектор",
    subtitle: "feat. Lumin",
    coverUrl: "/hero/vibes.png",
    label: "ICECREAMMUSIC",
    upc: "",
    preorderDate: "20.04.2026",
    releaseDate: "02.05.2026",
    startDate: "02.05.2026",
    territories: "Все страны",
    territoriesCount: 244,
    platformsCount: 56,
    genre: "Hip-Hop",
    status: "moderation",
    paid: true,
    metadataLanguage: "Russian",
    releaseType: "single",
    artists: "Ckeabrona",
    feat: "Lumin",
    countryStartEarly: false,
    realTimeDelivery: true,
    yandexDate: "20.04.2026",
    previewUrl: "/hero/vibes.png",
    tracks: [
      {
        id: "trk_002",
        title: "Ночной Вектор",
        subtitle: "feat. Lumin",
        isrc: "RUTBM2600046",
        partnerCode: "PK-8891",
        artists: "Ckeabrona",
        feat: "Lumin",
        musicAuthor: "Ckeabrona",
        lyricsAuthor: "Lumin",
        copyright: "50%",
        neighboringRights: "50%",
        language: "Russian",
        explicit: false,
        live: false,
        cover: false,
        remix: false,
        instrumental: false,
        prereleaseStart: "00:00",
        instantGratification: "-",
        focusTrack: false
      }
    ]
  },
  {
    id: "adm_rel_003",
    role: "studio",
    title: "Glass Frequency",
    subtitle: "Original Mix",
    coverUrl: "/hero/live.png",
    label: "ICECREAMMUSIC",
    upc: "",
    preorderDate: "21.04.2026",
    releaseDate: "05.05.2026",
    startDate: "05.05.2026",
    territories: "Все страны",
    territoriesCount: 244,
    platformsCount: 56,
    genre: "EDM",
    status: "changes_required",
    moderationComment: "Требуется исправить метаданные перед повторной отправкой.",
    moderationReturnedAt: "2026-04-27 10:18",
    moderationRemarks: [
      {
        section: "Релиз",
        field: "cover",
        message: "Обложка должна быть в формате JPG/PNG и соответствовать требованиям качества."
      },
      {
        section: "Трек 1",
        field: "tracks.0.isrc",
        message: "ISRC заполнен некорректно."
      }
    ],
    paid: true,
    metadataLanguage: "English",
    releaseType: "single",
    artists: "Nova Echo",
    feat: "",
    countryStartEarly: false,
    realTimeDelivery: false,
    yandexDate: "22.04.2026",
    previewUrl: "/hero/live.png",
    tracks: [
      {
        id: "trk_003",
        title: "Glass Frequency",
        subtitle: "Original Mix",
        isrc: "US-ICM-26-00991",
        partnerCode: "US-45X",
        artists: "Nova Echo",
        feat: "",
        musicAuthor: "Nova Echo",
        lyricsAuthor: "Nova Echo",
        copyright: "100%",
        neighboringRights: "100%",
        language: "English",
        explicit: false,
        live: false,
        cover: false,
        remix: false,
        instrumental: false,
        prereleaseStart: "00:00",
        instantGratification: "-",
        focusTrack: true
      }
    ]
  }
];

export function getAdminReleaseById(id: string) {
  return adminReleases.find((release) => release.id === id);
}
