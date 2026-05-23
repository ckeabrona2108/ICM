// @ts-nocheck
import { PrismaClient, CampaignStatus, FinanceReportStatus, PlatformDeliveryStatus, PayoutMethod, PayoutRequestStatus, ReleaseStatus, ReleaseType, Role, SubscriptionPlan, SubscriptionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  const seedUserEmail = process.env.SEED_USER_EMAIL ?? "user@local.icm";
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@local.icm";
  const seedUserPassword = process.env.SEED_USER_PASSWORD ?? "change-this-password";
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-this-admin-password";
  const seedUserPasswordHash = hashPassword(seedUserPassword);
  const seedAdminPasswordHash = hashPassword(seedAdminPassword);

  const [spotify, apple, yandex, vk, youtube, deezer, tiktok] = await Promise.all([
    prisma.platform.upsert({ where: { code: "spotify" }, update: {}, create: { id: randomUUID(), code: "spotify", name: "Spotify", region: "global" } }),
    prisma.platform.upsert({ where: { code: "apple-music" }, update: {}, create: { id: randomUUID(), code: "apple-music", name: "Apple Music", region: "global" } }),
    prisma.platform.upsert({ where: { code: "yandex-music" }, update: {}, create: { id: randomUUID(), code: "yandex-music", name: "Yandex Music", region: "ru" } }),
    prisma.platform.upsert({ where: { code: "vk-music" }, update: {}, create: { id: randomUUID(), code: "vk-music", name: "VK Music", region: "ru" } }),
    prisma.platform.upsert({ where: { code: "youtube-music" }, update: {}, create: { id: randomUUID(), code: "youtube-music", name: "YouTube Music", region: "global" } }),
    prisma.platform.upsert({ where: { code: "deezer" }, update: {}, create: { id: randomUUID(), code: "deezer", name: "Deezer", region: "global" } }),
    prisma.platform.upsert({ where: { code: "tiktok-reels" }, update: {}, create: { id: randomUUID(), code: "tiktok-reels", name: "TikTok / Reels", region: "global" } })
  ]);

  const artist = await prisma.user.upsert({
    where: { email: seedUserEmail },
    update: {
      name: "Nova Echo",
      role: Role.USER,
      passwordHash: seedUserPasswordHash
    },
    create: {
      id: randomUUID(),
      email: seedUserEmail,
      name: "Nova Echo",
      role: Role.USER,
      passwordHash: seedUserPasswordHash,
      updatedAt: new Date(),
      ArtistProfile: {
        create: {
          id: randomUUID(),
          stageName: "Nova Echo",
          bio: "Electronic vocalist and producer based in Madrid.",
          country: "Spain",
          genres: ["Electronica", "Synth Pop"],
          updatedAt: new Date(),
          socialLinks: {
            instagram: "https://instagram.com/novaecho",
            tiktok: "https://tiktok.com/@novaecho"
          }
        }
      },
      Subscription_Subscription_userIdToUser: {
        create: {
          id: randomUUID(),
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          updatedAt: new Date(),
          renewalAt: new Date("2026-06-01T00:00:00.000Z"),
          features: {
            aiGenerations: 500,
            uploadsPerMonth: 20,
            premiumSupport: true
          }
        }
      }
    },
    include: { ArtistProfile: true }
  });

  const admin = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {
      name: "ICM Admin",
      role: Role.ADMIN,
      passwordHash: seedAdminPasswordHash
    },
    create: {
      email: seedAdminEmail,
      name: "ICM Admin",
      role: Role.ADMIN,
      passwordHash: seedAdminPasswordHash,
      id: randomUUID(),
      updatedAt: new Date()
    }
  });

  const release = await prisma.release.upsert({
    where: { slug: "neon-afterglow" },
    update: {},
    create: {
      id: randomUUID(),
      updatedAt: new Date(),
      userId: artist.id,
      artistProfileId: artist.ArtistProfile?.id,
      title: "Neon Afterglow",
      slug: "neon-afterglow",
      genre: "Synthwave",
      language: "English",
      releaseDate: new Date("2026-05-21T00:00:00.000Z"),
      type: ReleaseType.SINGLE,
      status: ReleaseStatus.MODERATION,
      explicit: false,
      upc: "871234567890",
      isrc: "US-ICM-26-00001",
      Track: {
        create: [{ id: randomUUID(), title: "Neon Afterglow", durationSec: 214, trackNumber: 1, isrc: "US-ICM-26-00001" }]
      },
      CoverImage: {
        create: {
          id: randomUUID(),
          storageKey: "covers/neon-afterglow.jpg",
          url: "https://images.unsplash.com/photo-1496293455970-f8581aae0e3b",
          width: 3000,
          height: 3000
        }
      },
      ReleaseFile: {
        create: {
          id: randomUUID(),
          storageKey: "audio/neon-afterglow.wav",
          url: "https://cdn.icm.dev/audio/neon-afterglow.wav",
          mimeType: "audio/wav",
          sizeBytes: 34_250_112
        }
      }
    }
  });

  await prisma.distributionStatus.createMany({
    data: [
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: spotify.id, status: PlatformDeliveryStatus.IN_REVIEW },
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: apple.id, status: PlatformDeliveryStatus.PENDING },
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: yandex.id, status: PlatformDeliveryStatus.PENDING },
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: vk.id, status: PlatformDeliveryStatus.PENDING },
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: youtube.id, status: PlatformDeliveryStatus.PENDING },
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: deezer.id, status: PlatformDeliveryStatus.PENDING },
      { id: randomUUID(), updatedAt: new Date(), releaseId: release.id, platformId: tiktok.id, status: PlatformDeliveryStatus.PENDING }
    ],
    skipDuplicates: true
  });

  await prisma.transaction.createMany({
    data: [
      {
        id: randomUUID(),
        userId: artist.id,
        amount: 648.22,
        type: TransactionType.ROYALTY,
        status: TransactionStatus.COMPLETED,
        description: "Streaming royalties for Mar 2026",
        processedAt: new Date("2026-04-10T10:00:00.000Z")
      },
      {
        id: randomUUID(),
        userId: artist.id,
        amount: -38,
        type: TransactionType.FEE,
        status: TransactionStatus.COMPLETED,
        description: "Platform fee"
      },
      {
        id: randomUUID(),
        userId: artist.id,
        amount: -240,
        type: TransactionType.PAYOUT,
        status: TransactionStatus.PENDING,
        description: "Payout request"
      }
    ]
  });

  await prisma.financeReport.createMany({
    data: [
      {
        id: randomUUID(),
        updatedAt: new Date(),
        userId: artist.id,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-31T23:59:59.000Z"),
        amount: 1884.12,
        status: FinanceReportStatus.AGREED,
        agreedAt: new Date("2026-04-15T08:00:00.000Z")
      },
      {
        id: randomUUID(),
        updatedAt: new Date(),
        userId: artist.id,
        periodStart: new Date("2026-04-01T00:00:00.000Z"),
        periodEnd: new Date("2026-06-30T23:59:59.000Z"),
        amount: 658.06,
        status: FinanceReportStatus.READY_TO_CONFIRM
      }
    ]
  });

  await prisma.payoutRequest.create({
    data: {
      id: randomUUID(),
      userId: artist.id,
      amount: 240,
      method: PayoutMethod.BANK_TRANSFER,
      updatedAt: new Date(),
      status: PayoutRequestStatus.REQUESTED,
      requisites: {
        recipientName: "Nova Echo",
        payoutMethod: "bank_transfer",
        accountNumber: "ES9121000418450200051332",
        bankName: "Santander",
        taxId: "A12345678"
      }
    }
  });

  await prisma.royalty.create({
    data: {
      id: randomUUID(),
      userId: artist.id,
      releaseId: release.id,
      amount: 648.22,
      statementDate: new Date("2026-03-31T00:00:00.000Z"),
      streams: 198420
    }
  });

  await prisma.marketingCampaign.create({
    data: {
      id: randomUUID(),
      userId: artist.id,
      releaseId: release.id,
      name: "Neon Afterglow Pre-Save",
      channel: "Instagram + TikTok",
      budget: 500,
      status: CampaignStatus.ACTIVE,
      startDate: new Date("2026-04-15T00:00:00.000Z"),
      endDate: new Date("2026-05-20T00:00:00.000Z"),
      smartLinkUrl: "https://icm.link/neon-afterglow",
      clicks: 12430,
      conversions: 2190,
      updatedAt: new Date()
    }
  });

  await prisma.supportTicket.create({
    data: {
      id: randomUUID(),
      userId: artist.id,
      title: "UPC validation on release",
      description: "Can you verify my UPC before moderation?",
      updatedAt: new Date(),
      status: "IN_PROGRESS",
      priority: "high",
      Message: {
        create: [
          {
            id: randomUUID(),
            userId: artist.id,
            direction: "INBOUND",
            subject: "UPC validation on release",
            body: "Can you verify my UPC before moderation?"
          },
          {
            id: randomUUID(),
            userId: artist.id,
            direction: "OUTBOUND",
            subject: "UPC validation on release",
            body: "Our team has validated the code, no issues found."
          }
        ]
      }
    }
  });

  await prisma.aiGeneration.create({
    data: {
      id: randomUUID(),
      userId: artist.id,
      tool: "PRESS_RELEASE",
      prompt: "Generate a cinematic press release for Neon Afterglow",
      result: "Nova Echo unveils Neon Afterglow, a nocturnal synthwave anthem crafted for late-night playlists.",
      tokensUsed: 948,
      cost: 0.42
    }
  });

  await prisma.adminLog.create({
    data: {
      id: randomUUID(),
      adminId: admin.id,
      action: "RELEASE_REVIEW_OPENED",
      targetType: "Release",
      targetId: release.id,
      payload: { releaseTitle: "Neon Afterglow" }
    }
  });

  console.log("Seed completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
