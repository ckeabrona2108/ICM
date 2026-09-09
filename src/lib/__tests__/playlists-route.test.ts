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
      createdAt: "2026-07-30T10:00:00.000Z"
    }]
  });
});
