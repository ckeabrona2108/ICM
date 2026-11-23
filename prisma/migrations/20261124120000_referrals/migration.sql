-- Referral program: invite links, who invited whom, bonus releases and ladder rewards.
-- Safe to run twice.

-- One invite code per artist: icecreammusic.net/r/<code>.
CREATE TABLE IF NOT EXISTS "icecream"."referral_codes" (
  "user_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_key" ON "icecream"."referral_codes"("code");

-- A friend who signed up by a link. Paid = the friend's first real payment (release or
-- subscription); the inviter's bonus is due 14 days later and is given once.
CREATE TABLE IF NOT EXISTS "icecream"."referrals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referrer_id" UUID NOT NULL,
  "referred_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_order_id" UUID,
  "paid_at" TIMESTAMPTZ(6),
  "reward_due_at" TIMESTAMPTZ(6),
  "rewarded_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" TEXT,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referrals_not_self" CHECK ("referrer_id" <> "referred_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_id_key" ON "icecream"."referrals"("referred_id");
CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "icecream"."referrals"("referrer_id");

-- Bonus releases: +1 for a paying friend, -1 when a release is sent with it (or an admin revokes).
CREATE TABLE IF NOT EXISTS "icecream"."referral_bonus_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" VARCHAR(32) NOT NULL,
  "referral_id" UUID,
  "release_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_bonus_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_bonus_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "referral_bonus_ledger_user_id_idx" ON "icecream"."referral_bonus_ledger"("user_id");
-- A friend gives one bonus, and a release spends one bonus.
CREATE UNIQUE INDEX IF NOT EXISTS "referral_bonus_ledger_referral_key"
  ON "icecream"."referral_bonus_ledger"("referral_id", "reason") WHERE "referral_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "referral_bonus_ledger_release_key"
  ON "icecream"."referral_bonus_ledger"("release_id") WHERE "release_id" IS NOT NULL;

-- Ladder: a month of PRO at 3 paying friends, a month of ENTERPRISE at 5. Given once each.
CREATE TABLE IF NOT EXISTS "icecream"."referral_ladder_rewards" (
  "user_id" UUID NOT NULL,
  "step" INTEGER NOT NULL,
  "plan" VARCHAR(16) NOT NULL,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_ladder_rewards_pkey" PRIMARY KEY ("user_id", "step"),
  CONSTRAINT "referral_ladder_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
