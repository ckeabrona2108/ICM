import assert from "node:assert/strict";
import test from "node:test";

import { dynamic } from "@/app/api/playlists/route";
import { buildPlaylistsResponse } from "@/lib/playlist-route-service";

test("playlists route is explicitly force-dynamic", () => {
  assert.equal(dynamic, "force-dynamic");
});

test("guest playlist access returns 401", async () => {
  const response = await buildPlaylistsResponse({
    session: null,
    prismaClient: {
      playlist_placements: {
        findMany: async () => {
          throw new Error("should not query prisma for guest");
        }
      }
    } as never
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("authenticated playlist access scopes records to the session user", async () => {
  let whereArgs: unknown = null;
  let orderByArgs: unknown = null;
  const placements = [
    {
      id: "placement_1",
      userId: "user_1",
      platform: "SPOTIFY",
      upc: "123",
      artistName: "Artist",
      trackTitle: "Track",
      position: "12",
      playlistName: "Fresh Finds",
      playlistUrl: "https://example.com/playlist",
      createdAt: new Date("2026-07-30T10:00:00.000Z")
    }
  ];

  const response = await buildPlaylistsResponse({
    session: { user: { id: "user_1" } },
    loadMeta: async () => new Map(),
    prismaClient: {
      playlist_placements: {
        findMany: async (args: { where: unknown; orderBy: unknown }) => {
          whereArgs = args.where;
          orderByArgs = args.orderBy;
          return placements;
        }
      }
    } as never
  });

  assert.deepEqual(whereArgs, { userId: "user_1" });
  assert.deepEqual(orderByArgs, { createdAt: "desc" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    placements: [{
      ...placements[0],
      releaseTitle: null,
      playlistCoverUrl: null,
      playlistFollowers: null,
      createdAt: "2026-07-30T10:00:00.000Z"
    }]
  });
});

test("a placement imported without UPC shows the release's UPC, not the internal key", async () => {
  const response = await buildPlaylistsResponse({
    session: { user: { id: "user_1" } },
    loadMeta: async () => new Map(),
    prismaClient: {
      playlist_placements: {
        findMany: async () => [
          {
            id: "p2",
            upc: "track:phil mahart|портреты",
            release: { title: "Портреты", upc: "5063635044004" },
            createdAt: new Date("2026-11-09T10:00:00.000Z")
          },
          { id: "p3", upc: "track:a|b", release: null, createdAt: new Date("2026-11-09T10:00:00.000Z") }
        ]
      }
    } as never
  });
  const body = (await response.json()) as { placements: Array<{ upc: string; releaseTitle: string | null }> };
  assert.equal(body.placements[0]?.upc, "5063635044004");
  assert.equal(body.placements[0]?.releaseTitle, "Портреты");
  assert.equal(body.placements[1]?.upc, "");
});

test("each placement gets its playlist cover and followers", async () => {
  const url = "https://music.yandex.ru/users/yandexmusic/playlists/1131";
  const response = await buildPlaylistsResponse({
    session: { user: { id: "user_1" } },
    loadMeta: async () => new Map([[url, { coverUrl: "https://avatars.yandex.net/x/400x400", followers: 10064 }]]),
    prismaClient: {
      playlist_placements: {
        findMany: async () => [{ id: "p1", upc: "1", playlistUrl: url, release: null, createdAt: new Date() }]
      }
    } as never
  });
  const body = (await response.json()) as { placements: Array<{ playlistCoverUrl: string; playlistFollowers: number }> };
  assert.equal(body.placements[0]?.playlistCoverUrl, "https://avatars.yandex.net/x/400x400");
  assert.equal(body.placements[0]?.playlistFollowers, 10064);
});
