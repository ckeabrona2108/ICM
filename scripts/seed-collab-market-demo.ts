import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import {
  encodeStructuredPostContent,
  type CollaborationIntent,
  type CollaborationPostMetadata,
  type CollaborationPreference,
  type CollaborationRole
} from "../src/lib/collaboration";
import { PERSONAL_ARTIST_PROFILE_KEY } from "../src/lib/artist-profile-shared";

const prisma = new PrismaClient();

type DemoRequest = {
  id: string;
  name: string;
  city: string;
  genre: string;
  role: CollaborationRole;
  intent: CollaborationIntent;
  preference: CollaborationPreference;
  request: string;
};

const DEMO_REQUESTS: DemoRequest[] = [
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000001",
    name: "Лина (тест)",
    city: "Москва",
    genre: "Поп",
    role: "vocalist",
    intent: "find_engineer",
    preference: "local",
    request: "Планирую записать вокал для двух песен. Нужна студия и звукорежиссёр, желательно две смены в ближайшие недели."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000002",
    name: "RIV (тест)",
    city: "Санкт-Петербург",
    genre: "Хип-хоп",
    role: "artist",
    intent: "find_engineer",
    preference: "hybrid",
    request: "Нужно сведение трека, около 35 дорожек. Вокал уже записан, хочется собрать плотный, но живой звук."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000003",
    name: "NEO (тест)",
    city: "Казань",
    genre: "R&B",
    role: "artist",
    intent: "find_beatmaker",
    preference: "remote",
    request: "Ищу бит в сторону современного R&B, 92-100 BPM. Важно оставить воздух под живой вокал, интересует эксклюзив."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000004",
    name: "Саша Вэйв (тест)",
    city: "Екатеринбург",
    genre: "Инди-поп",
    role: "artist",
    intent: "find_engineer",
    preference: "remote",
    request: "Есть два готовых сингла, нужен аккуратный мастеринг. Понадобятся версии для стримингов и инструменталы."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000005",
    name: "NORTH (тест)",
    city: "Новосибирск",
    genre: "Электроника",
    role: "producer",
    intent: "find_artist",
    preference: "remote",
    request: "Ищу вокалистку для melodic house трека, 122 BPM. Нужен английский текст и чисто записанный вокал."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000006",
    name: "Лира (тест)",
    city: "Краснодар",
    genre: "Поп-рок",
    role: "artist",
    intent: "find_songwriter",
    preference: "remote",
    request: "Есть мелодия и референсы для русскоязычного поп-рок сингла. Нужен автор, который поможет найти сильный припев."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000007",
    name: "KORA (тест)",
    city: "Ростов-на-Дону",
    genre: "Хип-хоп",
    role: "artist",
    intent: "find_producer",
    preference: "hybrid",
    request: "Собираю мини-альбом из четырёх треков. Ищу продюсера, чтобы собрать единый звук и доработать аранжировки."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000008",
    name: "Море (тест)",
    city: "Сочи",
    genre: "Акустика",
    role: "artist",
    intent: "find_engineer",
    preference: "local",
    request: "Нужна запись акустической гитары и вокала для лайв-сессии. Ищу студию с хорошей живой комнатой."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000009",
    name: "TEMA (тест)",
    city: "Самара",
    genre: "Трэп",
    role: "artist",
    intent: "find_beatmaker",
    preference: "remote",
    request: "Ищу несколько свежих трэп-битов без спорных семплов. Нужны stems и возможность быстро внести небольшие правки."
  },
  {
    id: "a2d1a001-8c74-4b4a-9d11-000000000010",
    name: "AURA (тест)",
    city: "Нижний Новгород",
    genre: "Дрим-поп",
    role: "artist",
    intent: "remix",
    preference: "remote",
    request: "Есть готовый дрим-поп сингл, хочу сделать ремикс. Интересны downtempo или electronic версия, исходники подготовлены."
  }
];

function assertLocalDemoDatabase() {
  if (process.env.COLLAB_MARKET_DEMO_SEED !== "1") {
    throw new Error("Set COLLAB_MARKET_DEMO_SEED=1 to manage Collab Market demo data.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const host = new URL(databaseUrl).hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "icecream_data"]);
  if (!localHosts.has(host)) {
    throw new Error("Collab Market demo data can only be managed in a local development database.");
  }
}

function demoEmail(index: number) {
  return `collab-demo-${String(index).padStart(2, "0")}@local.icm`;
}

async function upsertDemoRequest(request: DemoRequest, index: number) {
  const user = await prisma.user.upsert({
    where: { email: demoEmail(index) },
    update: {
      name: request.name,
      // The Collab role carries the producer designation. Keep the account type
      // compatible with older local schemas that only accept "artist" here.
      artistProfileType: "artist",
      label: "Тестовый профиль",
      country: "Россия",
      isVerifiedAuthor: true
    },
    create: {
      id: randomUUID(),
      email: demoEmail(index),
      name: request.name,
      artistProfileType: "artist",
      label: "Тестовый профиль",
      country: "Россия",
      isVerifiedAuthor: true
    }
  });
  const profileKey = PERSONAL_ARTIST_PROFILE_KEY;
  const publicationDate = new Date(Date.UTC(2026, 8, 20 + Math.floor((index - 1) / 2), 10 + (index % 5), 15 + index, 0));

  const collaboration: CollaborationPostMetadata = {
    intent: request.intent,
    role: request.role,
    status: "open",
    workflow: "seeking",
    customIntentLabel: "",
    genres: [request.genre],
    preference: request.preference,
    city: request.city,
    bio: "Тестовая заявка для проверки карточки."
  };
  const content = `${request.city}. ${request.request}`;
  const post = await prisma.artist_profile_posts.upsert({
    where: { id: request.id },
    update: {
      user_id: user.id,
      profile_key: profileKey,
      release_id: null,
      audience: "PUBLIC",
      content: encodeStructuredPostContent({ content, collaboration }),
      media_type: null,
      media_key: null,
      media_name: null,
      idempotency_key: `collab-market-demo-${index}`,
      created_at: publicationDate
    },
    create: {
      id: request.id,
      user_id: user.id,
      profile_key: profileKey,
      release_id: null,
      audience: "PUBLIC",
      content: encodeStructuredPostContent({ content, collaboration }),
      media_type: null,
      media_key: null,
      media_name: null,
      idempotency_key: `collab-market-demo-${index}`,
      created_at: publicationDate
    }
  });

  await prisma.social_activity_events.upsert({
    where: { kind_source_id: { kind: "POST", source_id: post.id } },
    update: {
      actor_user_id: user.id,
      profile_key: profileKey,
      audience: "PUBLIC",
      consent_state: "PUBLISHED",
      provenance: "APPLICATION",
      search_text: `${content} ${request.city} ${request.genre}`,
      media_kind: "NONE",
      is_collaboration: true,
      collaboration_intent: request.intent,
      collaboration_role: request.role,
      linked_release: false,
      category: "collaboration",
      published_at: publicationDate
    },
    create: {
      kind: "POST",
      source_id: post.id,
      actor_user_id: user.id,
      profile_key: profileKey,
      audience: "PUBLIC",
      consent_state: "PUBLISHED",
      provenance: "APPLICATION",
      dedupe_key: `post:${post.id}`,
      search_text: `${content} ${request.city} ${request.genre}`,
      media_kind: "NONE",
      is_collaboration: true,
      collaboration_intent: request.intent,
      collaboration_role: request.role,
      linked_release: false,
      category: "collaboration",
      published_at: publicationDate
    }
  });
}

async function removeDemoRequests() {
  const postIds = DEMO_REQUESTS.map((request) => request.id);
  const emails = DEMO_REQUESTS.map((_, index) => demoEmail(index + 1));

  await prisma.social_activity_events.deleteMany({
    where: { kind: "POST", source_id: { in: postIds } }
  });
  await prisma.artist_profile_posts.deleteMany({ where: { id: { in: postIds } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log(`Removed ${DEMO_REQUESTS.length} Collab Market demo requests and profiles.`);
}

async function main() {
  assertLocalDemoDatabase();
  if (process.argv.includes("--cleanup")) {
    await removeDemoRequests();
    return;
  }
  for (const [index, request] of DEMO_REQUESTS.entries()) {
    await upsertDemoRequest(request, index + 1);
  }
  await prisma.release.deleteMany({ where: { id: { in: DEMO_REQUESTS.map((request) => request.id) } } });
  console.log(`Created or updated ${DEMO_REQUESTS.length} Collab Market demo requests.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
