import { mkdir } from "node:fs/promises";
import path from "node:path";

import { test as setup } from "@playwright/test";

import { loginCommunityActor } from "./support/auth";
import {
  communityActorCredentials,
  communityAuthStatePath,
  type CommunityActorName
} from "./support/environment";

for (const actor of ["A", "B", "C"] as const satisfies readonly CommunityActorName[]) {
  setup(`authenticate community user ${actor}`, async ({ page }) => {
    const statePath = communityAuthStatePath(actor);
    await mkdir(path.dirname(statePath), { recursive: true });
    await loginCommunityActor(page, communityActorCredentials(actor));
    await page.context().storageState({ path: statePath });
  });
}
