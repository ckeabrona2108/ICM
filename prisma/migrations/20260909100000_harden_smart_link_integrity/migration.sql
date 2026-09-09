-- Keep public Smart Link slugs unique before adding the database guarantee.
-- Existing duplicate slugs are retained with deterministic suffixes.
WITH ranked_slugs AS (
  SELECT
    id,
    "shortName",
    ROW_NUMBER() OVER (PARTITION BY "shortName" ORDER BY id) AS row_number
  FROM "icecream"."promo_links"
)
UPDATE "icecream"."promo_links" AS links
SET "shortName" = ranked."shortName" || '-' || SUBSTRING(ranked.id::text, 1, 8)
FROM ranked_slugs AS ranked
WHERE links.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "promo_links_shortName_key"
  ON "icecream"."promo_links" ("shortName");
