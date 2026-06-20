CREATE TABLE "icecream"."partner_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "label" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "coversReleasePayment" BOOLEAN NOT NULL DEFAULT true,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(6),
  "allowedUserId" UUID,
  "allowedEmailDomain" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByAdminId" UUID,

  CONSTRAINT "partner_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "icecream"."partner_code_usages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partnerCodeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "releaseId" UUID NOT NULL,
  "codeSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "partner_code_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_codes_code_key" ON "icecream"."partner_codes"("code");
CREATE UNIQUE INDEX "partner_code_usages_partnerCodeId_releaseId_key"
  ON "icecream"."partner_code_usages"("partnerCodeId", "releaseId");

ALTER TABLE "icecream"."partner_codes"
  ADD CONSTRAINT "partner_codes_allowedUserId_user_id_fk"
  FOREIGN KEY ("allowedUserId")
  REFERENCES "icecream"."user"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "icecream"."partner_codes"
  ADD CONSTRAINT "partner_codes_createdByAdminId_user_id_fk"
  FOREIGN KEY ("createdByAdminId")
  REFERENCES "icecream"."user"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "icecream"."partner_code_usages"
  ADD CONSTRAINT "partner_code_usages_partnerCodeId_partner_codes_id_fk"
  FOREIGN KEY ("partnerCodeId")
  REFERENCES "icecream"."partner_codes"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "icecream"."partner_code_usages"
  ADD CONSTRAINT "partner_code_usages_releaseId_release_id_fk"
  FOREIGN KEY ("releaseId")
  REFERENCES "icecream"."release"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "icecream"."partner_code_usages"
  ADD CONSTRAINT "partner_code_usages_userId_user_id_fk"
  FOREIGN KEY ("userId")
  REFERENCES "icecream"."user"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
