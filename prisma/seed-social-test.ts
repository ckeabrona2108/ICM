import { Prisma, PrismaClient, release_type, verification_status } from "@prisma/client";

import { assertSocialTestDatabaseUrl } from "../scripts/test-db/social-test-db-policy.mjs";
import { normalizeArtistProfileKey } from "../src/lib/artist-profile-shared";
import { hashPassword } from "../src/lib/password";

const databaseTarget = assertSocialTestDatabaseUrl(process.env.SOCIAL_TEST_DATABASE_URL);
const prisma = new PrismaClient({
  datasources: { db: { url: databaseTarget.url } }
});

const TEST_PASSWORD = "SocialTest123!";

const USERS = {
  A: {
    id: "a0000000-0000-4000-8000-000000000001",
    email: "social-a@example.test",
    name: "Social Artist A",
    avatar: "/brand/default-user-avatar.png"
  },
  B: {
    id: "b0000000-0000-4000-8000-000000000002",
    email: "social-b@example.test",
    name: "Social Artist B",
    avatar: "/brand/default-user-avatar.png"
  },
  C: {
    id: "c0000000-0000-4000-8000-000000000003",
    email: "social-c@example.test",
    name: "Social Observer C",
    avatar: "/brand/default-user-avatar.png"
  }
} as const;

const RELEASES = {
  A: {
    id: "a1000000-0000-4000-8000-000000000011",
    owner: USERS.A,
    title: "A/B/C Fixture One",
    date: new Date("2026-01-10T12:00:00.000Z"),
    coverUrl: "/hero/drop.png",
    upc: "9900000000001"
  },
  B: {
    id: "b1000000-0000-4000-8000-000000000012",
    owner: USERS.B,
    title: "A/B/C Fixture Two",
    date: new Date("2026-01-11T12:00:00.000Z"),
    coverUrl: "/hero/vibes.png",
    upc: "9900000000002"
  }
} as const;

const BASELINE_POST_ID = "a2000000-0000-4000-8000-000000000021";

function profileSettings(release: (typeof RELEASES)[keyof typeof RELEASES]): Prisma.InputJsonValue {
  const artistKey = normalizeArtistProfileKey(release.owner.name);
  return {
    coverImage: { url: release.coverUrl },
    artistPublicProfiles: {
      [artistKey]: {
        enabled: true,
        profileType: "artist",
        displayName: release.owner.name,
        bio: `Isolated browser-test profile for ${release.owner.name}.`,
        city: "Test City",
        avatarKey: "",
        catalogReleaseIds: [release.id],
        autoPublishApprovedReleases: true,
        websiteUrl: "",
        vkUrl: "",
        telegramUrl: "",
        collaboration: {
          open: true,
          role: "artist",
          genres: ["test-pop"],
          intents: ["collaboration"],
          preference: "hybrid",
          bio: "Deterministic test-only collaboration profile."
        }
      }
    },
    submissionData: {
      artist: release.owner.name,
      performer: release.owner.name,
      coverUpload: { url: release.coverUrl },
      persons: [{ role: "performer", name: release.owner.name }],
      tracks: []
    }
  };
}

async function main() {
  const password = await hashPassword(TEST_PASSWORD);
  const userIds = Object.values(USERS).map((user) => user.id);
  const emails = Object.values(USERS).map((user) => user.email);

  await prisma.$transaction(async (tx) => {
    // A guarded disposable database may be reused between E2E runs. Removing only
    // the deterministic fixture identities gives each run a pristine social graph.
    await tx.user.deleteMany({
      where: {
        OR: [
          { id: { in: userIds } },
          { email: { in: emails } }
        ]
      }
    });

    for (const user of Object.values(USERS)) {
      await tx.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          artistProfileType: "artist",
          password,
          isVerifiedAuthor: true,
          isSubscribed: true,
          country: "Test"
        }
      });
    }

    for (const release of Object.values(RELEASES)) {
      await tx.release.create({
        data: {
          id: release.id,
          preview: release.coverUrl,
          title: release.title,
          date: release.date,
          upc: release.upc,
          userId: release.owner.id,
          language: "English",
          performer: release.owner.name,
          genre: "Test Pop",
          startDate: release.date,
          preorderDate: release.date,
          type: release_type.single,
          confirmed: true,
          status: verification_status.approved,
          roles: profileSettings(release)
        }
      });
    }

    await tx.artist_profile_posts.create({
      data: {
        id: BASELINE_POST_ID,
        user_id: USERS.A.id,
        profile_key: normalizeArtistProfileKey(USERS.A.name),
        release_id: RELEASES.A.id,
        content: "Deterministic baseline post for the isolated A/B/C social test environment."
      }
    });
  }, { timeout: 30_000 });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    database: databaseTarget.database,
    fixtures: {
      A: { ...USERS.A, password: TEST_PASSWORD },
      B: { ...USERS.B, password: TEST_PASSWORD },
      C: { ...USERS.C, password: TEST_PASSWORD },
      baselinePostId: BASELINE_POST_ID,
      releaseIds: Object.values(RELEASES).map((release) => release.id)
    }
  }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
