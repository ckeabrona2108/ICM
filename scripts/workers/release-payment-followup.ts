import { PrismaClient } from "@prisma/client";

import { runReleasePaymentFollowup } from "../../src/lib/release-payment-followup";

if (process.env.RELEASE_PAYMENT_FOLLOWUP_WORKER !== "1") {
  throw new Error("Refusing to run: set RELEASE_PAYMENT_FOLLOWUP_WORKER=1 explicitly");
}

const prisma = new PrismaClient();

runReleasePaymentFollowup({ prisma })
  .then((result) => {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
