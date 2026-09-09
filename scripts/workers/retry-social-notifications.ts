import { PrismaClient } from "@prisma/client";

import { retryPendingSocialNotifications } from "../../src/lib/social-notification-outbox";

if (process.env.SOCIAL_OUTBOX_WORKER !== "1") {
  throw new Error("Refusing to run: set SOCIAL_OUTBOX_WORKER=1 explicitly");
}

const prisma = new PrismaClient();

retryPendingSocialNotifications(prisma, Number(process.env.SOCIAL_OUTBOX_BATCH_SIZE ?? 50))
  .then((delivered) => {
    process.stdout.write(`${JSON.stringify({ delivered, ok: true })}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
