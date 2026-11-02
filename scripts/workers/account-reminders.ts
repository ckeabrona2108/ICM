import { PrismaClient } from "@prisma/client";

import { runAccountReminders } from "../../src/lib/account-lifecycle-notifications";

if (process.env.ACCOUNT_REMINDERS_WORKER !== "1") {
  throw new Error("Refusing to run: set ACCOUNT_REMINDERS_WORKER=1 explicitly");
}

const prisma = new PrismaClient();

runAccountReminders({ prisma })
  .then((result) => {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
