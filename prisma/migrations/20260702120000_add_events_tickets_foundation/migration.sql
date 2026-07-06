DO $$
BEGIN
  CREATE TYPE "icecream"."EventStatus" AS ENUM ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'SOLD_OUT', 'CANCELLED', 'FINISHED', 'HIDDEN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventType" AS ENUM ('CONCERT', 'FESTIVAL', 'CLUB_SHOW', 'LIVESTREAM', 'SHOWCASE', 'MEETUP', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventAgeRestriction" AS ENUM ('ALL_AGES', 'AGE_6', 'AGE_12', 'AGE_16', 'AGE_18', 'AGE_21');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventArtistRole" AS ENUM ('HEADLINER', 'ARTIST', 'DJ', 'MC', 'GUEST', 'HOST', 'SPECIAL_GUEST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventTicketTypeKind" AS ENUM ('REGULAR', 'EARLY_BIRD', 'VIP', 'BACKSTAGE', 'GUEST_LIST', 'FREE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventTicketStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'PAID', 'USED', 'CANCELLED', 'REFUNDED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventPaymentStatus" AS ENUM ('PENDING_PAYMENT', 'PREPARING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."EventFinancialDirection" AS ENUM ('CREDIT', 'DEBIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "icecream"."venues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "address" TEXT,
  "place_id" TEXT,
  "map_provider" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venues_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizer_user_id" UUID NOT NULL,
  "venue_id" UUID,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "event_type" "icecream"."EventType" NOT NULL DEFAULT 'CONCERT',
  "age_restriction" "icecream"."EventAgeRestriction" NOT NULL DEFAULT 'ALL_AGES',
  "description" TEXT,
  "city" TEXT,
  "venue_name" TEXT,
  "address" TEXT,
  "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "starts_at" TIMESTAMP(6) NOT NULL,
  "ends_at" TIMESTAMP(6),
  "cover_image_url" TEXT,
  "poster_image_url" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "ticket_sales_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ticket_terms" TEXT,
  "status" "icecream"."EventStatus" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMP(6),
  "moderation_note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_slug_key" UNIQUE ("slug"),
  CONSTRAINT "events_organizer_user_id_fkey"
    FOREIGN KEY ("organizer_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "events_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "icecream"."venues"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "value" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_tags_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_artists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "artist_user_id" UUID,
  "display_name" TEXT NOT NULL,
  "photo_url" TEXT,
  "role" "icecream"."EventArtistRole" NOT NULL DEFAULT 'ARTIST',
  "performance_time" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_artists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_artists_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_artists_artist_user_id_fkey"
    FOREIGN KEY ("artist_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_images" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "image_url" TEXT NOT NULL,
  "alt_text" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'gallery',
  "is_cover" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_images_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_ticket_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "kind" "icecream"."EventTicketTypeKind" NOT NULL DEFAULT 'REGULAR',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "quantity_total" INTEGER NOT NULL DEFAULT 0,
  "quantity_sold" INTEGER NOT NULL DEFAULT 0,
  "per_user_limit" INTEGER NOT NULL DEFAULT 10,
  "sales_start_at" TIMESTAMP(6),
  "sales_end_at" TIMESTAMP(6),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_ticket_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_ticket_types_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."ticket_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "ticket_type_id" UUID NOT NULL,
  "buyer_user_id" UUID,
  "status" "icecream"."EventPaymentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "buyer_email" TEXT NOT NULL,
  "buyer_phone" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "payment_provider" TEXT,
  "payment_reference" TEXT,
  "completed_at" TIMESTAMP(6),
  "cancelled_at" TIMESTAMP(6),
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_orders_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_orders_ticket_type_id_fkey"
    FOREIGN KEY ("ticket_type_id") REFERENCES "icecream"."event_ticket_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_orders_buyer_user_id_fkey"
    FOREIGN KEY ("buyer_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."ticket_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "provider" TEXT,
  "provider_payment_id" TEXT,
  "status" "icecream"."EventPaymentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "raw_payload" JSONB,
  "confirmed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_payments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "icecream"."ticket_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_payments_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_payouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizer_user_id" UUID NOT NULL,
  "event_id" UUID,
  "status" "icecream"."EventPaymentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "method" TEXT,
  "notes" TEXT,
  "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_payouts_organizer_user_id_fkey"
    FOREIGN KEY ("organizer_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_payouts_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_financial_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "organizer_user_id" UUID NOT NULL,
  "order_id" UUID,
  "payment_id" UUID,
  "payout_id" UUID,
  "direction" "icecream"."EventFinancialDirection" NOT NULL,
  "gross_amount" DECIMAL(14,2) NOT NULL,
  "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "description" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_financial_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_financial_transactions_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_financial_transactions_organizer_user_id_fkey"
    FOREIGN KEY ("organizer_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_financial_transactions_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "icecream"."ticket_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "event_financial_transactions_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "icecream"."ticket_payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "event_financial_transactions_payout_id_fkey"
    FOREIGN KEY ("payout_id") REFERENCES "icecream"."event_payouts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."event_tickets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "ticket_type_id" UUID NOT NULL,
  "order_id" UUID,
  "buyer_user_id" UUID,
  "ticket_code" TEXT NOT NULL,
  "qr_payload" TEXT NOT NULL,
  "status" "icecream"."EventTicketStatus" NOT NULL DEFAULT 'AVAILABLE',
  "buyer_email" TEXT,
  "buyer_phone" TEXT,
  "purchase_at" TIMESTAMP(6),
  "used_at" TIMESTAMP(6),
  "cancelled_at" TIMESTAMP(6),
  "refunded_at" TIMESTAMP(6),
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_tickets_ticket_code_key" UNIQUE ("ticket_code"),
  CONSTRAINT "event_tickets_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_tickets_ticket_type_id_fkey"
    FOREIGN KEY ("ticket_type_id") REFERENCES "icecream"."event_ticket_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_tickets_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "icecream"."ticket_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "event_tickets_buyer_user_id_fkey"
    FOREIGN KEY ("buyer_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."ticket_checkins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "checked_in_by_user_id" UUID NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'qr',
  "gate_name" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_checkins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_checkins_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_checkins_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "icecream"."event_tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_checkins_checked_in_by_user_id_fkey"
    FOREIGN KEY ("checked_in_by_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "venues_owner_user_id_created_at_idx"
  ON "icecream"."venues"("owner_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "venues_name_idx"
  ON "icecream"."venues"("name");
CREATE INDEX IF NOT EXISTS "venues_city_idx"
  ON "icecream"."venues"("city");
CREATE INDEX IF NOT EXISTS "events_organizer_user_id_status_starts_at_idx"
  ON "icecream"."events"("organizer_user_id", "status", "starts_at");
CREATE INDEX IF NOT EXISTS "events_venue_id_idx"
  ON "icecream"."events"("venue_id");
CREATE INDEX IF NOT EXISTS "event_tags_event_id_sort_order_idx"
  ON "icecream"."event_tags"("event_id", "sort_order");
CREATE INDEX IF NOT EXISTS "event_artists_event_id_sort_order_idx"
  ON "icecream"."event_artists"("event_id", "sort_order");
CREATE INDEX IF NOT EXISTS "event_images_event_id_sort_order_idx"
  ON "icecream"."event_images"("event_id", "sort_order");
CREATE INDEX IF NOT EXISTS "event_ticket_types_event_id_sort_order_idx"
  ON "icecream"."event_ticket_types"("event_id", "sort_order");
CREATE INDEX IF NOT EXISTS "ticket_orders_event_id_created_at_idx"
  ON "icecream"."ticket_orders"("event_id", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_orders_buyer_user_id_created_at_idx"
  ON "icecream"."ticket_orders"("buyer_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_orders_status_created_at_idx"
  ON "icecream"."ticket_orders"("status", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_payments_order_id_created_at_idx"
  ON "icecream"."ticket_payments"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_payments_provider_payment_id_idx"
  ON "icecream"."ticket_payments"("provider_payment_id");
CREATE INDEX IF NOT EXISTS "event_tickets_event_id_status_created_at_idx"
  ON "icecream"."event_tickets"("event_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "event_tickets_buyer_user_id_created_at_idx"
  ON "icecream"."event_tickets"("buyer_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_checkins_event_id_created_at_idx"
  ON "icecream"."ticket_checkins"("event_id", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_checkins_ticket_id_idx"
  ON "icecream"."ticket_checkins"("ticket_id");
CREATE INDEX IF NOT EXISTS "event_financial_transactions_organizer_user_id_created_at_idx"
  ON "icecream"."event_financial_transactions"("organizer_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "event_financial_transactions_event_id_created_at_idx"
  ON "icecream"."event_financial_transactions"("event_id", "created_at");
CREATE INDEX IF NOT EXISTS "event_payouts_organizer_user_id_requested_at_idx"
  ON "icecream"."event_payouts"("organizer_user_id", "requested_at");

ALTER TABLE "icecream"."ticket_orders"
  ADD COLUMN IF NOT EXISTS "order_number" TEXT,
  ADD COLUMN IF NOT EXISTS "buyer_name" TEXT,
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "email_sent_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "email_delivery_status" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_message_id" TEXT;

ALTER TABLE "icecream"."event_tickets"
  ADD COLUMN IF NOT EXISTS "public_token" TEXT,
  ADD COLUMN IF NOT EXISTS "holder_name" TEXT,
  ADD COLUMN IF NOT EXISTS "checked_in_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "checked_in_by_type" TEXT,
  ADD COLUMN IF NOT EXISTS "checked_in_by_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_orders_order_number_key"
  ON "icecream"."ticket_orders"("order_number");

CREATE UNIQUE INDEX IF NOT EXISTS "event_tickets_public_token_key"
  ON "icecream"."event_tickets"("public_token");

CREATE INDEX IF NOT EXISTS "event_tickets_event_id_public_token_idx"
  ON "icecream"."event_tickets"("event_id", "public_token");

CREATE TABLE IF NOT EXISTS "icecream"."staff_access_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "label" TEXT,
  "role" TEXT NOT NULL DEFAULT 'staff',
  "expires_at" TIMESTAMP(6) NOT NULL,
  "revoked_at" TIMESTAMP(6),
  "created_by_user_id" UUID NOT NULL,
  "last_used_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_access_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_access_tokens_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_access_tokens_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_access_tokens_token_hash_key"
  ON "icecream"."staff_access_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "staff_access_tokens_event_id_created_at_idx"
  ON "icecream"."staff_access_tokens"("event_id", "created_at");

CREATE INDEX IF NOT EXISTS "staff_access_tokens_event_id_expires_at_idx"
  ON "icecream"."staff_access_tokens"("event_id", "expires_at");

CREATE TABLE IF NOT EXISTS "icecream"."ticket_check_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "ticket_id" UUID,
  "check_mode" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "staff_access_id" UUID,
  "scanner_ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_check_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_check_logs_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "icecream"."events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_check_logs_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "icecream"."event_tickets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ticket_check_logs_staff_access_id_fkey"
    FOREIGN KEY ("staff_access_id") REFERENCES "icecream"."staff_access_tokens"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ticket_check_logs_event_id_created_at_idx"
  ON "icecream"."ticket_check_logs"("event_id", "created_at");

CREATE INDEX IF NOT EXISTS "ticket_check_logs_ticket_id_created_at_idx"
  ON "icecream"."ticket_check_logs"("ticket_id", "created_at");

CREATE INDEX IF NOT EXISTS "ticket_check_logs_staff_access_id_created_at_idx"
  ON "icecream"."ticket_check_logs"("staff_access_id", "created_at");
