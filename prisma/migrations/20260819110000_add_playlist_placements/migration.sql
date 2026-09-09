CREATE TABLE IF NOT EXISTS "icecream"."playlist_placements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "releaseId" UUID,
  "platform" TEXT NOT NULL,
  "upc" TEXT NOT NULL,
  "artistName" TEXT,
  "trackTitle" TEXT,
  "position" TEXT,
  "playlistName" TEXT NOT NULL,
  "playlistUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playlist_placements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "playlist_placements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE SET NULL,
  CONSTRAINT "playlist_placements_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "icecream"."release"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "playlist_placements_platform_upc_playlistUrl_key"
  ON "icecream"."playlist_placements"("platform", "upc", "playlistUrl");
CREATE INDEX IF NOT EXISTS "playlist_placements_userId_createdAt_idx"
  ON "icecream"."playlist_placements"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "playlist_placements_releaseId_createdAt_idx"
  ON "icecream"."playlist_placements"("releaseId", "createdAt");
