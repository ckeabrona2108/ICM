import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";
import { deliverUserNotification, type UserNotificationEvent } from "@/lib/notification-delivery-service";
import type { PromoSubmissionDetail } from "@/lib/promo-service";
import { isTelegramNotificationKind } from "@/lib/telegram-notification-channel";
import { isVkNotificationKind } from "@/lib/vk-messages";
import {
  buildPromoHintAfterApproval,
  buildPromoStatusNotification,
  buildPromoSubmittedTelegramText,
  notifyAdminPromoSubmitted,
  notifyArtistPromoComment,
  notifyArtistPromoOpen,
  notifyArtistPromoStatus,
  PROMO_NOTIFICATION_KIND
} from "@/lib/promo-notifications";

const NOW = new Date("2026-07-05T12:00:00.000Z");

test("admin telegram says whether the request is on time for pitching", () => {
  const onTime = buildPromoSubmittedTelegramText(
    { id: "p1", artistName: "Олег", releaseTitle: "Лёд", releaseDate: "2026-07-20" },
    { now: NOW }
  );
  assert.match(onTime, /^Новая заявка на промо/u);
  assert.match(onTime, /Выход: 20\.07\.2026 \(до выхода 15 дн\. — успевает на питчинг\)/u);
  assert.match(onTime, /\/admin\/promo\/p1$/u);

  const late = buildPromoSubmittedTelegramText(
    { id: "p2", artistName: "Олег", releaseTitle: "Лёд", releaseDate: "2026-07-10" },
    { now: NOW, resubmitted: true }
  );
  assert.match(late, /^Исправленная заявка на промо/u);
  assert.match(late, /на питчинг поздно/u);
});

test("artist hears about decisions, with the admin comment", () => {
  const rejected = buildPromoStatusNotification({ releaseTitle: "Лёд", status: "REJECTED", adminComment: "Нужно фото" });
  assert.equal(rejected?.title, "Заявку на промо нужно исправить");
  assert.match(rejected?.message ?? "", /Комментарий: Нужно фото$/u);
  assert.equal(buildPromoStatusNotification({ releaseTitle: "Лёд", status: "SUBMITTED", adminComment: null }), null);
});

test("approval hint gives the pitching deadline, or the release day when it is late", () => {
  const onTime = buildPromoHintAfterApproval("Лёд", new Date("2026-07-25T00:00:00.000Z"), NOW);
  assert.match(onTime?.message ?? "", /до 12\.07\.2026 включительно/u);
  const late = buildPromoHintAfterApproval("Лёд", new Date("2026-07-10T00:00:00.000Z"), NOW);
  assert.match(late?.message ?? "", /уже не успевает.*до 10\.07\.2026/u);
  assert.equal(buildPromoHintAfterApproval("Лёд", new Date("2026-07-01T00:00:00.000Z"), NOW), null);
});

const fakePrisma = {} as PrismaClient;

function recorder() {
  const events: UserNotificationEvent[] = [];
  return { events, deliver: async (_prisma: PrismaClient, event: UserNotificationEvent) => void events.push(event) };
}

function submission(patch: Partial<PromoSubmissionDetail> = {}): PromoSubmissionDetail {
  return {
    id: "sub_1", userId: "user_1", userName: "Олег", userEmail: "o@example.com", releaseId: "rel_1",
    releaseTitle: "Лёд", releaseDate: "2026-12-10", status: "IN_REVIEW", createdAt: "", updatedAt: "",
    reviewedAt: null, reviewedBy: null, reviewedByName: null, adminComment: null, email: "o@example.com",
    partnerName: "Олег", artistName: "Олег", artistCountry: "Россия", genre: "Hip-Hop", releaseFormat: "Single",
    releaseLanguage: "Русский", upc: "4610000000011", keyTrackTitle: "Лёд", hasMusicVideo: false, videoPreviewUrl: null,
    label: "ICECREAMMUSIC", releaseDescription: "", artistPhotoUrl: "", listeningLink: "", promotionPlan: "",
    artistSocialLinks: "", confirmationAccepted: true, ...patch
  };
}

test("promo notifications reach the cabinet, VK and Telegram of the artist", () => {
  assert.equal(isVkNotificationKind(PROMO_NOTIFICATION_KIND), true);
  assert.equal(isTelegramNotificationKind(PROMO_NOTIFICATION_KIND), true);
});

test("a new and a corrected request each send one admin Telegram message", async () => {
  const sent: string[] = [];
  const send = async (text: string) => void sent.push(text);
  await notifyAdminPromoSubmitted(submission(), { send });
  await notifyAdminPromoSubmitted(submission(), { send, resubmitted: true });
  assert.equal(sent.length, 2);
  assert.match(sent[0]!, /^Новая заявка на промо\nЛёд — Олег/u);
  assert.match(sent[1]!, /^Исправленная заявка на промо/u);
});

test("a failing Telegram send does not break the request", async () => {
  await notifyAdminPromoSubmitted(submission(), { send: async () => { throw new Error("relay down"); } });
});

test("each new status is sent to the artist once, with a link to the promo page", async () => {
  const { events, deliver } = recorder();
  await notifyArtistPromoStatus(fakePrisma, submission({ status: "IN_REVIEW" }), "SUBMITTED", deliver);
  await notifyArtistPromoStatus(fakePrisma, submission({ status: "IN_REVIEW" }), "IN_REVIEW", deliver);
  await notifyArtistPromoStatus(fakePrisma, submission({ status: "SUBMITTED" }), "IN_REVIEW", deliver);
  await notifyArtistPromoStatus(fakePrisma, submission({ status: "SENT_TO_PARTNERS" }), "APPROVED", deliver);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => [event.id, event.kind, event.userId, event.href, event.sendEmail, event.sendVk]),
    [
      ["promo-status-sub_1-IN_REVIEW", PROMO_NOTIFICATION_KIND, "user_1", "/dashboard/promo", false, undefined],
      ["promo-status-sub_1-SENT_TO_PARTNERS", PROMO_NOTIFICATION_KIND, "user_1", "/dashboard/promo", false, undefined]
    ]
  );
  assert.equal(events[1]?.title, "Заявка на промо передана партнёрам");
});

test("every admin status has an artist message, except the artist's own «Отправлено»", async () => {
  const { events, deliver } = recorder();
  for (const status of ["IN_REVIEW", "APPROVED", "REJECTED", "SENT_TO_PARTNERS", "CANCELLED"] as const) {
    await notifyArtistPromoStatus(fakePrisma, submission({ status }), null, deliver);
  }
  assert.deepEqual(events.map((event) => event.title), [
    "Заявка на промо на рассмотрении",
    "Заявка на промо одобрена",
    "Заявку на промо нужно исправить",
    "Заявка на промо передана партнёрам",
    "Заявка на промо отменена"
  ]);
});

test("a comment is sent when it is new, not when it is unchanged or empty", async () => {
  const { events, deliver } = recorder();
  await notifyArtistPromoComment(fakePrisma, submission({ adminComment: "Нужно фото артиста" }), null, deliver);
  await notifyArtistPromoComment(fakePrisma, submission({ adminComment: "Нужно фото артиста" }), "Нужно фото артиста", deliver);
  await notifyArtistPromoComment(fakePrisma, submission({ adminComment: "  " }), "Нужно фото артиста", deliver);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.message, "По промо-заявке на релиз «Лёд»: Нужно фото артиста");
});

test("the approval hint stays in the cabinet and skips releases already out", async () => {
  const { events, deliver } = recorder();
  const future = new Date(Date.now() + 30 * 86_400_000);
  await notifyArtistPromoOpen(fakePrisma, { id: "rel_1", userId: "user_1", title: "Лёд", date: future }, deliver);
  await notifyArtistPromoOpen(fakePrisma, { id: "rel_2", userId: "user_1", title: "Старый", date: new Date(Date.now() - 86_400_000 * 3) }, deliver);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, "promo-open-rel_1");
  assert.equal(events[0]?.sendVk, false);
  assert.equal(events[0]?.sendTelegram, false);
  assert.match(events[0]?.message ?? "", /успевает на питчинг/u);
});


function recordingPrisma() {
  const calls: string[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const model = (name: string) =>
    new Proxy({}, {
      get: (_target, method) => async (args: Record<string, unknown>) => {
        calls.push(`${name}.${String(method)}`);
        if (name === "ai_user_notifications" && method === "upsert") upserts.push(args);
        return null;
      }
    });
  const prisma = new Proxy({}, {
    get: (_target, name) => (typeof name === "string" && !name.startsWith("$") ? model(name) : async () => [])
  }) as unknown as PrismaClient;
  return { prisma, calls, upserts };
}

test("a promo status lands in the cabinet bell and is offered to VK", async () => {
  const { prisma, calls, upserts } = recordingPrisma();
  await notifyArtistPromoStatus(prisma, submission({ status: "APPROVED" }), "IN_REVIEW", (db, event) =>
    deliverUserNotification(db, { ...event, sendPush: false })
  );
  const create = upserts[0]?.create as Record<string, unknown> | undefined;
  assert.equal(create?.kind, PROMO_NOTIFICATION_KIND);
  assert.equal(create?.title, "Заявка на промо одобрена");
  assert.equal(create?.cta_href, "/dashboard/promo");
  assert.equal(create?.user_id, "user_1");
  assert.ok(calls.includes("vk_links.findUnique"), "VK link is looked up for the artist");
});

test("the approval hint lands in the bell without a VK message", async () => {
  const { prisma, calls, upserts } = recordingPrisma();
  await notifyArtistPromoOpen(
    prisma,
    { id: "rel_1", userId: "user_1", title: "Лёд", date: new Date(Date.now() + 30 * 86_400_000) },
    (db, event) => deliverUserNotification(db, { ...event, sendPush: false })
  );
  assert.equal(upserts.length, 1);
  assert.equal(calls.includes("vk_links.findUnique"), false);
});
