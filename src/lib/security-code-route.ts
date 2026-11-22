import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  checkSecurityGate,
  restoreSecurityGrant,
  type SecurityAction,
  type SecurityCodeChallenge
} from "@/lib/security-codes";

// 428 tells the cabinet to show the code window; the client sends the code and repeats the request.
export interface SecurityCodeRequiredResponse {
  error: string;
  securityCode: SecurityCodeChallenge;
}

export function securityCodeRequiredMessage(challenge: SecurityCodeChallenge): string {
  if (challenge.channels.length > 0) return "Подтвердите действие кодом.";
  if (challenge.confirmEmail) return "Подтвердите почту кодом, чтобы вывести деньги.";
  return challenge.held.length > 0
    ? "Новый способ получения кодов ещё не активен."
    : "Чтобы вывести деньги, подключите Telegram или подтвердите почту.";
}

export type SecurityCodeCheck =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      /** False when the cabinet had no channel to receive a code and the action went through without one. */
      viaCode: boolean;
      /** Gives the code back when the action fails for another reason, so the artist need not ask for a new one. */
      release(): Promise<void>;
    };

export async function requireSecurityCode(userId: string, action: SecurityAction): Promise<SecurityCodeCheck> {
  const gate = await checkSecurityGate(prisma, { userId, action });
  if (gate.ok) {
    const grantId = gate.grantId;
    return {
      ok: true,
      viaCode: gate.viaCode,
      release: async () => {
        if (grantId) await restoreSecurityGrant(prisma, grantId);
      }
    };
  }
  const body: SecurityCodeRequiredResponse = {
    error: securityCodeRequiredMessage(gate.challenge),
    securityCode: gate.challenge
  };
  return { ok: false, response: NextResponse.json(body, { status: 428, headers: { "cache-control": "no-store" } }) };
}
