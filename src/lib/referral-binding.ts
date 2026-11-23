import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { REFERRAL_COOKIE } from "@/lib/referral-shared";
import { bindReferral } from "@/lib/referrals";

/**
 * Right after an account is created (email or VK / Yandex / Telegram sign-in): ties it to the
 * artist whose link it came from. The code comes from the sign-up form or the link cookie.
 * Never blocks sign-up.
 */
export async function bindReferralAfterSignUp(userId: string, formCode?: string | null): Promise<void> {
  try {
    let code = formCode?.trim() || null;
    if (!code) {
      try {
        code = cookies().get(REFERRAL_COOKIE)?.value ?? null;
      } catch {
        code = null;
      }
    }
    if (!code) return;
    await bindReferral(prisma, { referredId: userId, code });
  } catch (error) {
    console.error("[referrals] bind after sign-up failed", { userId, error });
  }
}
