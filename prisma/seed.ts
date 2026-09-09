import {
  FinanceReportStatus,
  PayoutMethod,
  PayoutRequestStatus,
  PrismaClient,
  TransactionStatus,
  TransactionType,
  release_type,
  verification_status
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { hashPassword } from "../src/lib/password";
import { normalizeArtistProfileKey, PERSONAL_ARTIST_PROFILE_KEY } from "../src/lib/artist-profile-shared";

type SeedUser = {
  email: string;
  name: string;
  password: string;
  artistProfileType: string;
  avatar: string;
  isAdmin?: boolean;
  country?: string;
  label?: string | null;
  telegram?: string | null;
  vk?: string | null;
};

type SeededUser = Awaited<ReturnType<typeof upsertUser>>;

type ReleaseSeed = {
  id: string;
  trackId: string;
  owner: SeededUser;
  title: string;
  performer: string;
  profileDisplayName: string;
  profileType: "artist" | "group" | "label";
  genre: string;
  date: string;
  upc: string;
  coverUrl: string;
  audioUrl: string;
  previewStart?: string;
  extraArtists?: string[];
  bio?: string;
  city?: string;
};

const prisma = new PrismaClient();

const IDS = {
  artistRelease: "11111111-1111-4111-8111-111111111111",
  artistTrack: "11111111-1111-4111-8111-111111111112",
  producerRelease: "22222222-2222-4222-8222-222222222221",
  producerTrack: "22222222-2222-4222-8222-222222222222",
  labelRelease: "33333333-3333-4333-8333-333333333331",
  labelTrack: "33333333-3333-4333-8333-333333333332",
  collabRelease: "44444444-4444-4444-8444-444444444441",
  collabTrack: "44444444-4444-4444-8444-444444444442",
  groupRelease: "44444444-4444-4444-8444-444444444443",
  groupTrack: "44444444-4444-4444-8444-444444444444",
  artistPost: "55555555-5555-4555-8555-555555555551",
  collabPost: "55555555-5555-4555-8555-555555555552",
  labelPost: "55555555-5555-4555-8555-555555555553",
  listenerPost: "55555555-5555-4555-8555-555555555554",
  producerPost: "55555555-5555-4555-8555-555555555555",
  postComment1: "66666666-6666-4666-8666-666666666661",
  postReply1: "66666666-6666-4666-8666-666666666662",
  releaseComment1: "77777777-7777-4777-8777-777777777771",
  releaseReply1: "77777777-7777-4777-8777-777777777772",
  releaseComment2: "77777777-7777-4777-8777-777777777773",
  postLike1: "88888888-8888-4888-8888-888888888881",
  postLike2: "88888888-8888-4888-8888-888888888882",
  postLike3: "88888888-8888-4888-8888-888888888883",
  releaseLike1: "99999999-9999-4999-8999-999999999991",
  releaseLike2: "99999999-9999-4999-8999-999999999992",
  releaseLike3: "99999999-9999-4999-8999-999999999993",
  releasePlay1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  releasePlay2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  releasePlay3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  followArtist: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  followLabel: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  followProducer: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  financeArtist: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  transactionArtist: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  payoutArtist: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  news1: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  news2: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2"
} as const;

const MEDIA = {
  artistCover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80",
  producerCover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80",
  labelCover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80",
  collabCover: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  groupCover: "https://images.unsplash.com/photo-1521334884684-d80222895322?auto=format&fit=crop&w=1200&q=80",
  artistAudio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  producerAudio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  labelAudio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  collabAudio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  groupAudio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  artistAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
  listenerAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80",
  producerAvatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&q=80",
  groupAvatar: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=256&q=80",
  labelAvatar: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=256&q=80",
  newsCover1: "https://images.unsplash.com/photo-1496293455970-f8581aae0e3b?auto=format&fit=crop&w=1200&q=80",
  newsCover2: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80"
} as const;

function buildArtistProfileSettings(params: {
  releaseId: string;
  displayName: string;
  profileType: "artist" | "group" | "label";
  bio?: string;
  city?: string;
}) {
  const artistKey = normalizeArtistProfileKey(params.displayName);
  return {
    artistKey,
    profile: {
      enabled: true,
      profileType: params.profileType,
      displayName: params.displayName,
      bio: params.bio ?? "",
      city: params.city ?? "",
      avatarKey: "",
      catalogReleaseIds: [params.releaseId],
      autoPublishApprovedReleases: true,
      websiteUrl: "",
      vkUrl: "",
      telegramUrl: ""
    }
  };
}

function buildReleaseRoles(seed: ReleaseSeed) {
  const { artistKey, profile } = buildArtistProfileSettings({
    releaseId: seed.id,
    displayName: seed.profileDisplayName,
    profileType: seed.profileType,
    bio: seed.bio,
    city: seed.city
  });

  const trackPersons = [seed.performer, ...(seed.extraArtists ?? [])].map((name) => ({
    role: "performer",
    name
  }));

  return {
    coverUpload: { url: seed.coverUrl },
    artistPublicProfiles: {
      [artistKey]: profile
    },
    submissionData: {
      artist: seed.performer,
      performer: seed.performer,
      persons: trackPersons,
      tracks: [
        {
          id: seed.trackId,
          audioUrl: seed.audioUrl,
          trackPersons
        }
      ]
    }
  };
}

async function upsertUser(input: SeedUser) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      password: passwordHash,
      artistProfileType: input.artistProfileType,
      avatar: input.avatar,
      isAdmin: input.isAdmin ?? false,
      country: input.country ?? null,
      label: input.label ?? null,
      telegram: input.telegram ?? null,
      vk: input.vk ?? null
    },
    create: {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      password: passwordHash,
      artistProfileType: input.artistProfileType,
      avatar: input.avatar,
      isAdmin: input.isAdmin ?? false,
      country: input.country ?? null,
      label: input.label ?? null,
      telegram: input.telegram ?? null,
      vk: input.vk ?? null,
      isVerifiedAuthor: true,
      isSubscribed: true
    }
  });
}

async function upsertRelease(seed: ReleaseSeed) {
  const date = new Date(seed.date);
  const roles = buildReleaseRoles(seed);

  await prisma.release.upsert({
    where: { id: seed.id },
    update: {
      preview: "cover.jpg",
      title: seed.title,
      date,
      userId: seed.owner.id,
      language: "Russian",
      performer: seed.performer,
      genre: seed.genre,
      startDate: date,
      preorderDate: date,
      type: release_type.single,
      confirmed: true,
      status: verification_status.approved,
      upc: seed.upc,
      roles
    },
    create: {
      id: seed.id,
      preview: "cover.jpg",
      title: seed.title,
      date,
      userId: seed.owner.id,
      language: "Russian",
      performer: seed.performer,
      genre: seed.genre,
      startDate: date,
      preorderDate: date,
      type: release_type.single,
      confirmed: true,
      status: verification_status.approved,
      upc: seed.upc,
      roles
    }
  });

  await prisma.track.upsert({
    where: { id: seed.trackId },
    update: {
      releaseId: seed.id,
      title: seed.title,
      preview_start: seed.previewStart ?? "0:00",
      language: "Russian",
      track: seed.audioUrl,
      author_rights: "ICECREAMMUSIC demo rights",
      index: 1,
      roles: {
        audioUrl: seed.audioUrl,
        audioUpload: { url: seed.audioUrl },
        trackPersons: [seed.performer, ...(seed.extraArtists ?? [])].map((name) => ({ role: "performer", name }))
      }
    },
    create: {
      id: seed.trackId,
      releaseId: seed.id,
      title: seed.title,
      preview_start: seed.previewStart ?? "0:00",
      language: "Russian",
      track: seed.audioUrl,
      author_rights: "ICECREAMMUSIC demo rights",
      index: 1,
      roles: {
        audioUrl: seed.audioUrl,
        audioUpload: { url: seed.audioUrl },
        trackPersons: [seed.performer, ...(seed.extraArtists ?? [])].map((name) => ({ role: "performer", name }))
      }
    }
  });
}

async function main() {
  const seedArtistEmail = process.env.SEED_USER_EMAIL ?? "artist.a@local.icm";
  const seedArtistPassword = process.env.SEED_USER_PASSWORD ?? "DevPass123!";
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@local.icm";
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? "AdminPass123!";

  const admin = await upsertUser({
    email: seedAdminEmail,
    name: "ICM Admin",
    password: seedAdminPassword,
    artistProfileType: "artist",
    avatar: MEDIA.artistAvatar,
    isAdmin: true,
    country: "Spain"
  });

  const artist = await upsertUser({
    email: seedArtistEmail,
    name: "Ckeabrona",
    password: seedArtistPassword,
    artistProfileType: "artist",
    avatar: MEDIA.artistAvatar,
    country: "Spain",
    telegram: "https://t.me/icecreammusicnews"
  });

  const listener = await upsertUser({
    email: "listener.b@local.icm",
    name: "Mamasita",
    password: "DevPass123!",
    artistProfileType: "artist",
    avatar: MEDIA.listenerAvatar,
    country: "Spain"
  });

  const producer = await upsertUser({
    email: "producer.c@local.icm",
    name: "Pulsecraft",
    password: "DevPass123!",
    artistProfileType: "producer",
    avatar: MEDIA.producerAvatar,
    country: "Spain"
  });

  const label = await upsertUser({
    email: "label.d@local.icm",
    name: "Northline Records",
    password: "DevPass123!",
    artistProfileType: "label",
    avatar: MEDIA.labelAvatar,
    country: "Spain",
    label: "Northline Records"
  });

  const group = await upsertUser({
    email: "group.e@local.icm",
    name: "Aurora Signals",
    password: "DevPass123!",
    artistProfileType: "group",
    avatar: MEDIA.groupAvatar,
    country: "Spain"
  });

  const releases: ReleaseSeed[] = [
    {
      id: IDS.artistRelease,
      trackId: IDS.artistTrack,
      owner: artist,
      title: "Последний танец",
      performer: "Ckeabrona",
      profileDisplayName: "Ckeabrona",
      profileType: "artist",
      genre: "Pop",
      date: "2026-07-17T09:00:00.000Z",
      upc: "100000000001",
      coverUrl: MEDIA.artistCover,
      audioUrl: MEDIA.artistAudio,
      bio: "Эмоциональный поп-артист с фокусом на короткие релизные истории.",
      city: "Madrid"
    },
    {
      id: IDS.producerRelease,
      trackId: IDS.producerTrack,
      owner: producer,
      title: "Signal Bloom",
      performer: "Pulsecraft",
      profileDisplayName: "Pulsecraft",
      profileType: "artist",
      genre: "Electronic",
      date: "2026-07-12T09:00:00.000Z",
      upc: "100000000002",
      coverUrl: MEDIA.producerCover,
      audioUrl: MEDIA.producerAudio,
      bio: "Продюсер и саунд-дизайнер, который публикует процесс и фрагменты.",
      city: "Barcelona"
    },
    {
      id: IDS.labelRelease,
      trackId: IDS.labelTrack,
      owner: label,
      title: "Summer Lights",
      performer: "Northline Records",
      profileDisplayName: "Northline Records",
      profileType: "label",
      genre: "Indie",
      date: "2026-07-05T09:00:00.000Z",
      upc: "100000000003",
      coverUrl: MEDIA.labelCover,
      audioUrl: MEDIA.labelAudio,
      bio: "Независимый лейбл с фокусом на новые городские релизы.",
      city: "Valencia"
    },
    {
      id: IDS.collabRelease,
      trackId: IDS.collabTrack,
      owner: artist,
      title: "Blue Echo",
      performer: "Ckeabrona",
      profileDisplayName: "Ckeabrona",
      profileType: "artist",
      genre: "Pop",
      date: "2026-07-24T09:00:00.000Z",
      upc: "100000000004",
      coverUrl: MEDIA.collabCover,
      audioUrl: MEDIA.collabAudio,
      extraArtists: ["Pulsecraft"],
      bio: "Коллаборационный релиз с продюсерским акцентом.",
      city: "Madrid"
    },
    {
      id: IDS.groupRelease,
      trackId: IDS.groupTrack,
      owner: group,
      title: "Night Parade",
      performer: "Aurora Signals",
      profileDisplayName: "Aurora Signals",
      profileType: "group",
      genre: "Synthwave",
      date: "2026-07-09T09:00:00.000Z",
      upc: "100000000005",
      coverUrl: MEDIA.groupCover,
      audioUrl: MEDIA.groupAudio,
      bio: "Группа, открытая к коллаборациям на стыке synthwave и alt-pop.",
      city: "Seville"
    }
  ];

  for (const release of releases) {
    await upsertRelease(release);
  }

  const artistKey = normalizeArtistProfileKey("Ckeabrona");
  const labelKey = normalizeArtistProfileKey("Northline Records");

  await prisma.artist_profile_posts.upsert({
    where: { id: IDS.artistPost },
    update: {
      user_id: artist.id,
      profile_key: artistKey,
      release_id: IDS.artistRelease,
      content: "Новый релиз уже в ленте. Слушайте фрагмент и пишите, какой момент забрать в клип.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-17T10:00:00.000Z")
    },
    create: {
      id: IDS.artistPost,
      user_id: artist.id,
      profile_key: artistKey,
      release_id: IDS.artistRelease,
      content: "Новый релиз уже в ленте. Слушайте фрагмент и пишите, какой момент забрать в клип.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-17T10:00:00.000Z")
    }
  });

  await prisma.artist_profile_posts.upsert({
    where: { id: IDS.collabPost },
    update: {
      user_id: artist.id,
      profile_key: artistKey,
      release_id: IDS.collabRelease,
      content: "Blue Echo собран вместе с Pulsecraft. Оставили только тот фрагмент, который реально захотелось переслушать.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-24T11:00:00.000Z")
    },
    create: {
      id: IDS.collabPost,
      user_id: artist.id,
      profile_key: artistKey,
      release_id: IDS.collabRelease,
      content: "Blue Echo собран вместе с Pulsecraft. Оставили только тот фрагмент, который реально захотелось переслушать.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-24T11:00:00.000Z")
    }
  });

  await prisma.artist_profile_posts.upsert({
    where: { id: IDS.labelPost },
    update: {
      user_id: label.id,
      profile_key: labelKey,
      release_id: IDS.labelRelease,
      content: "У нас в каталоге ещё один июльский релиз. В ленту выводим только то, что уже можно нормально открыть и послушать.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-05T12:00:00.000Z")
    },
    create: {
      id: IDS.labelPost,
      user_id: label.id,
      profile_key: labelKey,
      release_id: IDS.labelRelease,
      content: "У нас в каталоге ещё один июльский релиз. В ленту выводим только то, что уже можно нормально открыть и послушать.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-05T12:00:00.000Z")
    }
  });

  await prisma.artist_profile_posts.upsert({
    where: { id: IDS.listenerPost },
    update: {
      user_id: listener.id,
      profile_key: PERSONAL_ARTIST_PROFILE_KEY,
      release_id: null,
      content: "Слежу за новыми релизами здесь. Удобно, что можно читать комментарии без входа, а потом уже авторизоваться для реакции.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-21T08:30:00.000Z")
    },
    create: {
      id: IDS.listenerPost,
      user_id: listener.id,
      profile_key: PERSONAL_ARTIST_PROFILE_KEY,
      release_id: null,
      content: "Слежу за новыми релизами здесь. Удобно, что можно читать комментарии без входа, а потом уже авторизоваться для реакции.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-21T08:30:00.000Z")
    }
  });

  await prisma.artist_profile_posts.upsert({
    where: { id: IDS.producerPost },
    update: {
      user_id: producer.id,
      profile_key: PERSONAL_ARTIST_PROFILE_KEY,
      release_id: null,
      content: "В следующей итерации добавлю breakdown по аранжировке. Пока оставил только playable-preview и короткий текст.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-13T09:30:00.000Z")
    },
    create: {
      id: IDS.producerPost,
      user_id: producer.id,
      profile_key: PERSONAL_ARTIST_PROFILE_KEY,
      release_id: null,
      content: "В следующей итерации добавлю breakdown по аранжировке. Пока оставил только playable-preview и короткий текст.",
      media_type: null,
      media_key: null,
      media_name: null,
      created_at: new Date("2026-07-13T09:30:00.000Z")
    }
  });

  await prisma.artist_profile_post_comments.upsert({
    where: { id: IDS.postComment1 },
    update: {
      post_id: IDS.artistPost,
      user_id: listener.id,
      parent_id: null,
      content: "Этот релиз реально цепляет. Оставьте, пожалуйста, полную версию припева в клипе.",
      created_at: new Date("2026-07-17T11:00:00.000Z")
    },
    create: {
      id: IDS.postComment1,
      post_id: IDS.artistPost,
      user_id: listener.id,
      parent_id: null,
      content: "Этот релиз реально цепляет. Оставьте, пожалуйста, полную версию припева в клипе.",
      created_at: new Date("2026-07-17T11:00:00.000Z")
    }
  });

  await prisma.artist_profile_post_comments.upsert({
    where: { id: IDS.postReply1 },
    update: {
      post_id: IDS.artistPost,
      user_id: producer.id,
      parent_id: IDS.postComment1,
      content: "Поддерживаю. И микс у припева тоже очень чистый.",
      created_at: new Date("2026-07-17T11:20:00.000Z")
    },
    create: {
      id: IDS.postReply1,
      post_id: IDS.artistPost,
      user_id: producer.id,
      parent_id: IDS.postComment1,
      content: "Поддерживаю. И микс у припева тоже очень чистый.",
      created_at: new Date("2026-07-17T11:20:00.000Z")
    }
  });

  await prisma.scene_release_comments.upsert({
    where: { id: IDS.releaseComment1 },
    update: {
      release_id: IDS.artistRelease,
      user_id: listener.id,
      parent_id: null,
      content: "Слушается легко. Особенно зашёл кусок после первой минуты.",
      created_at: new Date("2026-07-17T12:00:00.000Z")
    },
    create: {
      id: IDS.releaseComment1,
      release_id: IDS.artistRelease,
      user_id: listener.id,
      parent_id: null,
      content: "Слушается легко. Особенно зашёл кусок после первой минуты.",
      created_at: new Date("2026-07-17T12:00:00.000Z")
    }
  });

  await prisma.scene_release_comments.upsert({
    where: { id: IDS.releaseReply1 },
    update: {
      release_id: IDS.artistRelease,
      user_id: artist.id,
      parent_id: IDS.releaseComment1,
      content: "Именно этот момент и был опорным для финальной версии. Спасибо.",
      created_at: new Date("2026-07-17T12:15:00.000Z")
    },
    create: {
      id: IDS.releaseReply1,
      release_id: IDS.artistRelease,
      user_id: artist.id,
      parent_id: IDS.releaseComment1,
      content: "Именно этот момент и был опорным для финальной версии. Спасибо.",
      created_at: new Date("2026-07-17T12:15:00.000Z")
    }
  });

  await prisma.scene_release_comments.upsert({
    where: { id: IDS.releaseComment2 },
    update: {
      release_id: IDS.producerRelease,
      user_id: artist.id,
      parent_id: null,
      content: "Очень плотный продакшн. Хорошо, что в ленте появился playable-фрагмент прямо в карточке.",
      created_at: new Date("2026-07-13T10:10:00.000Z")
    },
    create: {
      id: IDS.releaseComment2,
      release_id: IDS.producerRelease,
      user_id: artist.id,
      parent_id: null,
      content: "Очень плотный продакшн. Хорошо, что в ленте появился playable-фрагмент прямо в карточке.",
      created_at: new Date("2026-07-13T10:10:00.000Z")
    }
  });

  await prisma.artist_profile_post_likes.upsert({
    where: { id: IDS.postLike1 },
    update: {
      post_id: IDS.artistPost,
      visitor_id: listener.id,
      reaction: "heart"
    },
    create: {
      id: IDS.postLike1,
      post_id: IDS.artistPost,
      visitor_id: listener.id,
      reaction: "heart"
    }
  });

  await prisma.artist_profile_post_likes.upsert({
    where: { id: IDS.postLike2 },
    update: {
      post_id: IDS.artistPost,
      visitor_id: producer.id,
      reaction: "fire"
    },
    create: {
      id: IDS.postLike2,
      post_id: IDS.artistPost,
      visitor_id: producer.id,
      reaction: "fire"
    }
  });

  await prisma.artist_profile_post_likes.upsert({
    where: { id: IDS.postLike3 },
    update: {
      post_id: IDS.labelPost,
      visitor_id: artist.id,
      reaction: "party"
    },
    create: {
      id: IDS.postLike3,
      post_id: IDS.labelPost,
      visitor_id: artist.id,
      reaction: "party"
    }
  });

  await prisma.scene_release_likes.upsert({
    where: { id: IDS.releaseLike1 },
    update: {
      release_id: IDS.artistRelease,
      visitor_id: listener.id,
      reaction: "heart"
    },
    create: {
      id: IDS.releaseLike1,
      release_id: IDS.artistRelease,
      visitor_id: listener.id,
      reaction: "heart"
    }
  });

  await prisma.scene_release_likes.upsert({
    where: { id: IDS.releaseLike2 },
    update: {
      release_id: IDS.artistRelease,
      visitor_id: label.id,
      reaction: "wow"
    },
    create: {
      id: IDS.releaseLike2,
      release_id: IDS.artistRelease,
      visitor_id: label.id,
      reaction: "wow"
    }
  });

  await prisma.scene_release_likes.upsert({
    where: { id: IDS.releaseLike3 },
    update: {
      release_id: IDS.producerRelease,
      visitor_id: artist.id,
      reaction: "thumbs"
    },
    create: {
      id: IDS.releaseLike3,
      release_id: IDS.producerRelease,
      visitor_id: artist.id,
      reaction: "thumbs"
    }
  });

  await prisma.scene_release_plays.upsert({
    where: { id: IDS.releasePlay1 },
    update: { release_id: IDS.artistRelease, visitor_id: listener.id },
    create: { id: IDS.releasePlay1, release_id: IDS.artistRelease, visitor_id: listener.id }
  });
  await prisma.scene_release_plays.upsert({
    where: { id: IDS.releasePlay2 },
    update: { release_id: IDS.artistRelease, visitor_id: producer.id },
    create: { id: IDS.releasePlay2, release_id: IDS.artistRelease, visitor_id: producer.id }
  });
  await prisma.scene_release_plays.upsert({
    where: { id: IDS.releasePlay3 },
    update: { release_id: IDS.producerRelease, visitor_id: artist.id },
    create: { id: IDS.releasePlay3, release_id: IDS.producerRelease, visitor_id: artist.id }
  });

  await prisma.artist_profile_followers.upsert({
    where: {
      profile_user_id_profile_key_follower_user_id: {
        profile_user_id: artist.id,
        profile_key: artistKey,
        follower_user_id: listener.id
      }
    },
    update: { id: IDS.followArtist },
    create: {
      id: IDS.followArtist,
      profile_user_id: artist.id,
      profile_key: artistKey,
      follower_user_id: listener.id
    }
  });

  await prisma.artist_profile_followers.upsert({
    where: {
      profile_user_id_profile_key_follower_user_id: {
        profile_user_id: label.id,
        profile_key: labelKey,
        follower_user_id: listener.id
      }
    },
    update: { id: IDS.followLabel },
    create: {
      id: IDS.followLabel,
      profile_user_id: label.id,
      profile_key: labelKey,
      follower_user_id: listener.id
    }
  });

  await prisma.artist_profile_followers.upsert({
    where: {
      profile_user_id_profile_key_follower_user_id: {
        profile_user_id: artist.id,
        profile_key: artistKey,
        follower_user_id: producer.id
      }
    },
    update: { id: IDS.followProducer },
    create: {
      id: IDS.followProducer,
      profile_user_id: artist.id,
      profile_key: artistKey,
      follower_user_id: producer.id
    }
  });

  await prisma.news.upsert({
    where: { id: IDS.news1 },
    update: {
      title: "Лента сообщества теперь показывает playable-релизы",
      content: "Публичную ленту можно читать без входа. Реакции, комментарии и подписки остаются доступны только после авторизации.",
      preview: MEDIA.newsCover1,
      createdAt: new Date("2026-07-26T09:00:00.000Z")
    },
    create: {
      id: IDS.news1,
      title: "Лента сообщества теперь показывает playable-релизы",
      content: "Публичную ленту можно читать без входа. Реакции, комментарии и подписки остаются доступны только после авторизации.",
      preview: MEDIA.newsCover1,
      createdAt: new Date("2026-07-26T09:00:00.000Z")
    }
  });

  await prisma.news.upsert({
    where: { id: IDS.news2 },
    update: {
      title: "В ленте оставлены только релизы с рабочим аудио и обложкой",
      content: "Автопубликация выводит в сообщество только те релизы, у которых есть доступный playable-фрагмент и нормальная cover-art.",
      preview: MEDIA.newsCover2,
      createdAt: new Date("2026-07-28T09:00:00.000Z")
    },
    create: {
      id: IDS.news2,
      title: "В ленте оставлены только релизы с рабочим аудио и обложкой",
      content: "Автопубликация выводит в сообщество только те релизы, у которых есть доступный playable-фрагмент и нормальная cover-art.",
      preview: MEDIA.newsCover2,
      createdAt: new Date("2026-07-28T09:00:00.000Z")
    }
  });

  await prisma.financeReport.upsert({
    where: { id: IDS.financeArtist },
    update: {
      userId: artist.id,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-31T23:59:59.000Z"),
      amount: 824.45,
      status: FinanceReportStatus.READY_TO_CONFIRM
    },
    create: {
      id: IDS.financeArtist,
      userId: artist.id,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-31T23:59:59.000Z"),
      amount: 824.45,
      status: FinanceReportStatus.READY_TO_CONFIRM
    }
  });

  await prisma.transaction.upsert({
    where: { id: IDS.transactionArtist },
    update: {
      userId: artist.id,
      amount: 248.12,
      type: TransactionType.ROYALTY,
      status: TransactionStatus.COMPLETED,
      description: "July streaming payout snapshot"
    },
    create: {
      id: IDS.transactionArtist,
      userId: artist.id,
      amount: 248.12,
      type: TransactionType.ROYALTY,
      status: TransactionStatus.COMPLETED,
      description: "July streaming payout snapshot"
    }
  });

  await prisma.payoutRequest.upsert({
    where: { id: IDS.payoutArtist },
    update: {
      userId: artist.id,
      amount: 120,
      method: PayoutMethod.BANK_TRANSFER,
      status: PayoutRequestStatus.REQUESTED,
      requisites: {
        recipientName: "Ckeabrona",
        iban: "ES7620770024003102575766",
        bankName: "Banco Demo"
      }
    },
    create: {
      id: IDS.payoutArtist,
      userId: artist.id,
      amount: 120,
      method: PayoutMethod.BANK_TRANSFER,
      status: PayoutRequestStatus.REQUESTED,
      requisites: {
        recipientName: "Ckeabrona",
        iban: "ES7620770024003102575766",
        bankName: "Banco Demo"
      }
    }
  });

  console.log(JSON.stringify({
    ok: true,
    users: {
      admin: admin.email,
      artist: artist.email,
      listener: listener.email,
      producer: producer.email,
      label: label.email,
      group: group.email
    },
    releases: releases.map((release) => release.title)
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
