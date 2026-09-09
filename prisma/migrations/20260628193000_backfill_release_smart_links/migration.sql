CREATE TABLE IF NOT EXISTS "icecream"."promo_links" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "shortName" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  CONSTRAINT "promo_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promo_links_releaseId_release_id_fk"
    FOREIGN KEY ("releaseId") REFERENCES "icecream"."Release"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."promo_urls" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "url" TEXT NOT NULL,
  "promoLinkId" TEXT,
  CONSTRAINT "promo_urls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promo_urls_promoLinkId_promo_links_id_fk"
    FOREIGN KEY ("promoLinkId") REFERENCES "icecream"."promo_links"("id") ON DELETE CASCADE
);

WITH missing_releases AS (
  SELECT
    r.id AS release_id,
    COALESCE(NULLIF(BTRIM(r.title), ''), 'release') AS raw_title
  FROM "icecream"."Release" r
  LEFT JOIN "icecream"."promo_links" pl
    ON pl."releaseId" = r.id
  WHERE pl.id IS NULL
),
prepared_slugs AS (
  SELECT
    release_id,
    CASE
      WHEN base_slug = '' THEN CONCAT('release-', SUBSTRING(release_id::text, 1, 8))
      WHEN EXISTS (
        SELECT 1
        FROM "icecream"."promo_links" existing
        WHERE existing."shortName" = base_slug
      ) THEN CONCAT(base_slug, '-', SUBSTRING(release_id::text, 1, 8))
      ELSE base_slug
    END AS short_name
  FROM (
    SELECT
      release_id,
      BTRIM(
        REGEXP_REPLACE(
          LOWER(raw_title),
          '[^[:alnum:]а-яё]+',
          '-',
          'g'
        ),
        '-'
      ) AS base_slug
    FROM missing_releases
  ) normalized
)
INSERT INTO "icecream"."promo_links" ("id", "shortName", "releaseId")
SELECT
  gen_random_uuid(),
  short_name,
  release_id
FROM prepared_slugs;
