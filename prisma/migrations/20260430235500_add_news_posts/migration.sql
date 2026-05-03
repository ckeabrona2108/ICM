DO $$ BEGIN
  CREATE TYPE "NewsPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "news_posts" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT,
  "content" TEXT NOT NULL,
  "cover_image" TEXT,
  "status" "NewsPostStatus" NOT NULL DEFAULT 'DRAFT',
  "category" TEXT,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3),
  "created_by_admin_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "news_posts_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "news_posts_slug_key" ON "news_posts"("slug");
CREATE INDEX IF NOT EXISTS "news_posts_status_idx" ON "news_posts"("status");
CREATE INDEX IF NOT EXISTS "news_posts_published_at_idx" ON "news_posts"("published_at");
CREATE INDEX IF NOT EXISTS "news_posts_is_pinned_idx" ON "news_posts"("is_pinned");
