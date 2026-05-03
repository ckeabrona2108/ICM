import type {
  AiToolCard,
  CampaignItem,
  FinanceReportItem,
  FinanceSnapshot,
  NotificationItem,
  ReleaseItem,
  StatPoint,
  SupportThread,
  TransactionItem,
  UserProfileData
} from "@/lib/types";

export const dashboardUser = {
  name: "Nova Echo",
  role: "Artist",
  plan: "Pro",
  avatar: "NE"
};

export const releases: ReleaseItem[] = [
  {
    id: "rel_001",
    title: "Neon Afterglow",
    artist: "Nova Echo",
    genre: "Synthwave",
    language: "English",
    type: "single",
    releaseDate: "2026-05-21",
    status: "moderation",
    streams: 198420,
    earnings: 648.22,
    platforms: [
      { name: "Spotify", status: "review" },
      { name: "Apple Music", status: "pending" },
      { name: "YouTube Music", status: "pending" }
    ]
  },
  {
    id: "rel_002",
    title: "Cold Lights",
    artist: "Nova Echo",
    genre: "Electronica",
    language: "English",
    type: "ep",
    releaseDate: "2026-03-18",
    status: "distributed",
    streams: 542880,
    earnings: 1642.11,
    platforms: [
      { name: "Spotify", status: "live" },
      { name: "Apple Music", status: "live" },
      { name: "TikTok / Reels", status: "live" }
    ]
  },
  {
    id: "rel_003",
    title: "Night Transit",
    artist: "Nova Echo",
    genre: "Downtempo",
    language: "Instrumental",
    type: "single",
    releaseDate: "2026-06-08",
    status: "draft",
    streams: 0,
    earnings: 0,
    platforms: [
      { name: "Spotify", status: "pending" },
      { name: "Apple Music", status: "pending" },
      { name: "Deezer", status: "pending" }
    ]
  }
];

export const statistics: StatPoint[] = [
  { date: "Week 1", streams: 18400, listeners: 11600, saves: 3200 },
  { date: "Week 2", streams: 22500, listeners: 12800, saves: 4100 },
  { date: "Week 3", streams: 27800, listeners: 15100, saves: 5200 },
  { date: "Week 4", streams: 30120, listeners: 16680, saves: 5900 },
  { date: "Week 5", streams: 33800, listeners: 18240, saves: 6420 },
  { date: "Week 6", streams: 36720, listeners: 20460, saves: 7100 }
];

export const financeSnapshot: FinanceSnapshot = {
  currentBalance: 2542.18,
  pendingPayout: 840,
  monthlyRevenue: 1322.42,
  platformFeePercent: 8,
  accruals: 3124.7,
  deductions: 332.52,
  commissionAmount: 249.98,
  pendingReportsCount: 1
};

export const financeReports: FinanceReportItem[] = [
  {
    id: "rep_2026_q1",
    period: "Q1 2026",
    amount: 1884.12,
    status: "Согласован"
  },
  {
    id: "rep_2026_q2",
    period: "Q2 2026",
    amount: 658.06,
    status: "Согласовать"
  }
];

export const transactions: TransactionItem[] = [
  {
    id: "txn_001",
    date: "2026-04-10",
    type: "Royalty",
    amount: 648.22,
    status: "Completed",
    description: "Streaming royalties (March)"
  },
  {
    id: "txn_002",
    date: "2026-04-15",
    type: "Fee",
    amount: -38,
    status: "Completed",
    description: "Platform service fee"
  },
  {
    id: "txn_003",
    date: "2026-04-23",
    type: "Payout",
    amount: -240,
    status: "Pending",
    description: "Withdrawal request"
  }
];

export const moderationNotifications: NotificationItem[] = [
  {
    id: "ntf_001",
    title: "Neon Afterglow in moderation",
    detail: "Metadata check in progress. ETA: 12h",
    type: "moderation",
    createdAt: "2h ago"
  },
  {
    id: "ntf_002",
    title: "Cover updated successfully",
    detail: "3000x3000 requirement passed",
    type: "ai",
    createdAt: "1d ago"
  },
  {
    id: "ntf_003",
    title: "New payout available",
    detail: "You can request withdrawal of $840",
    type: "finance",
    createdAt: "2d ago"
  }
];

export const aiTools: AiToolCard[] = [
  {
    id: "ai_1",
    title: "Release Description Generator",
    description: "Create a concise story for DSP submission and social cards.",
    promptPlaceholder: "Describe release mood, genre and target audience...",
    usageLeft: 137
  },
  {
    id: "ai_2",
    title: "Press Release Writer",
    description: "Generate publication-ready press release with headline variants.",
    promptPlaceholder: "Enter release context, key angle and publication style...",
    usageLeft: 84
  },
  {
    id: "ai_3",
    title: "Artist Bio Composer",
    description: "Build short and extended artist bio in one tone system.",
    promptPlaceholder: "Share milestones, genre, influences and goals...",
    usageLeft: 58
  },
  {
    id: "ai_4",
    title: "TikTok/Reels Idea Engine",
    description: "Produce hook ideas, scripts and posting cadence.",
    promptPlaceholder: "Describe release vibe, trend references and budget...",
    usageLeft: 201
  },
  {
    id: "ai_5",
    title: "Cover Analysis",
    description: "Assess contrast, readability and platform cropping safety.",
    promptPlaceholder: "Upload or paste cover concept and design notes...",
    usageLeft: 42
  },
  {
    id: "ai_6",
    title: "Promotion Strategy Advisor",
    description: "Generate rollout plan with channel allocation and KPI targets.",
    promptPlaceholder: "Input release goals, territory and ad budget...",
    usageLeft: 67
  }
];

export const campaigns: CampaignItem[] = [
  {
    id: "cmp_001",
    name: "Neon Afterglow Pre-save",
    channel: "Instagram + TikTok",
    budget: 500,
    spent: 320,
    clicks: 12430,
    conversions: 2190,
    status: "Active"
  },
  {
    id: "cmp_002",
    name: "Playlist Pitching Wave",
    channel: "Spotify Editorial + Curators",
    budget: 200,
    spent: 120,
    clicks: 860,
    conversions: 120,
    status: "Active"
  },
  {
    id: "cmp_003",
    name: "Press Drop Q2",
    channel: "Music blogs",
    budget: 350,
    spent: 350,
    clicks: 1100,
    conversions: 210,
    status: "Completed"
  }
];

export const supportThreads: SupportThread[] = [
  {
    id: "sup_001",
    subject: "UPC validation",
    lastMessage: "Our moderation team verified UPC format.",
    unread: 0,
    status: "In progress",
    updatedAt: "Today, 11:42"
  },
  {
    id: "sup_002",
    subject: "Royalty report mismatch",
    lastMessage: "Please attach statement for February.",
    unread: 2,
    status: "Open",
    updatedAt: "Yesterday, 21:12"
  },
  {
    id: "sup_003",
    subject: "Campaign smart link",
    lastMessage: "Link deployed and tracking is active.",
    unread: 0,
    status: "Resolved",
    updatedAt: "Apr 21"
  }
];

export const profileData: UserProfileData = {
  name: "Valeria Torres",
  stageName: "Nova Echo",
  email: "valeria@icm.dev",
  country: "Spain",
  genres: ["Electronica", "Synth Pop", "Indie Dance"],
  bio: "Nova Echo blends cinematic synth textures with intimate vocals, crafting high-energy tracks for night drives and festival sets.",
  socialLinks: {
    instagram: "instagram.com/novaecho",
    tiktok: "tiktok.com/@novaecho",
    youtube: "youtube.com/@novaecho"
  }
};

export const adminOverview = {
  totalUsers: 12452,
  activeReleases: 3874,
  moderationQueue: 93,
  monthlyPayouts: 428120
};

export const adminModerationItems = [
  {
    id: "mod_001",
    release: "Neon Afterglow",
    artist: "Nova Echo",
    submittedAt: "2026-04-25 19:10",
    status: "moderation"
  },
  {
    id: "mod_002",
    release: "Ocean Exit",
    artist: "Jina Loop",
    submittedAt: "2026-04-25 16:35",
    status: "moderation"
  },
  {
    id: "mod_003",
    release: "Razorlight Dreams",
    artist: "Metrik-9",
    submittedAt: "2026-04-25 14:22",
    status: "moderation"
  }
];

export const platformList = [
  "Apple Music",
  "Spotify",
  "7digital",
  "ACRCloud",
  "Amazon Music",
  "Anghami",
  "AudibleMagic",
  "AWA",
  "BASE_NDA",
  "BeeLine KZ",
  "Иная дистрибуция",
  "Mobi Music KZ",
  "Jaxsta",
  "Cron Telecom",
  "LyricFind",
  "Билайн, t2 (РБТ)",
  "МТС (РБТ)",
  "VK Видео",
  "Peloton",
  "Smule",
  "Spotify Видео",
  "TikTok",
  "Яндекс Видео",
  "Звук / Wink Music",
  "ClicknClear",
  "FLO",
  "iHeart",
  "JioSaavn",
  "Likee",
  "mobi music",
  "МегаФон (РБТ)",
  "YouTube (Sound Recording)",
  "VK Музыка",
  "Pretzel",
  "SoundCloud",
  "Tencent",
  "TREBEL",
  "YouTube Copyright",
  "Звук Видео",
  "Deezer",
  "GoMusic",
  "IPEX",
  "KKBOX",
  "LINE MUSIC / Rythm",
  "MusixMatch",
  "РБТ-Партнёрка",
  "Netease",
  "Pandora",
  "Qobuz",
  "SoundExchange",
  "TIDAL",
  "Яндекс Музыка",
  "YouTube Music"
];
