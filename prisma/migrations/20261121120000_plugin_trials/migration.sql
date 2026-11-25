-- Free 7-day trial of the GLAZE plugins: one per account and one per computer.
CREATE TABLE "icecream"."plugin_trials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "device_id" VARCHAR(128) NOT NULL,
  "product" VARCHAR(80) NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plugin_trials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plugin_trials_user_id_key" ON "icecream"."plugin_trials"("user_id");
CREATE UNIQUE INDEX "plugin_trials_device_id_key" ON "icecream"."plugin_trials"("device_id");

ALTER TABLE "icecream"."plugin_trials"
  ADD CONSTRAINT "plugin_trials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
