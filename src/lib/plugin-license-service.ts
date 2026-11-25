import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  buildPluginLicense,
  createPluginToken,
  passwordFingerprint,
  PluginLicenseConfigError,
  PLUGIN_SUBSCRIBE_URL,
  PLUGIN_TRIAL_DAYS
} from "@/lib/plugin-license";
import { prisma } from "@/lib/prisma";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

export interface PluginSessionResult {
  token: string;
  license: string;
  account: { email: string; name: string };
  subscription: { active: boolean; plan: string | null; endsAt: string | null };
  trial: { active: boolean; endsAt: string | null; used: boolean };
  subscribeUrl: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Пробный период плагинов: 7 дней с первого входа из плагина, один на аккаунт и один на компьютер.
 * Начинается только у аккаунта без подписки. Возвращает конец пробного периода (если он был).
 */
export async function resolvePluginTrial(
  userId: string,
  deviceId: string,
  product: string,
  canStart: boolean,
  now = new Date()
): Promise<{ endsAt: Date | null; used: boolean }> {
  const own = await prisma.plugin_trials.findUnique({ where: { user_id: userId } });
  if (own) return { endsAt: own.ends_at, used: true };
  if (!canStart) return { endsAt: null, used: false };

  // этот компьютер уже брал пробный период с другого аккаунта
  const onDevice = await prisma.plugin_trials.findUnique({ where: { device_id: deviceId } });
  if (onDevice) return { endsAt: null, used: true };

  try {
    const created = await prisma.plugin_trials.create({
      data: {
        user_id: userId,
        device_id: deviceId,
        product: product.slice(0, 80) || "GLAZE",
        started_at: now,
        ends_at: new Date(now.getTime() + PLUGIN_TRIAL_DAYS * DAY_MS)
      }
    });
    return { endsAt: created.ends_at, used: true };
  } catch (error) {
    // два запроса одновременно: пробный период уже создан другим
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.plugin_trials.findUnique({ where: { user_id: userId } });
      return again ? { endsAt: again.ends_at, used: true } : { endsAt: null, used: true };
    }
    throw error;
  }
}

/**
 * Выдаёт плагину ключ устройства и свежую лицензию.
 * Подписка — та же, что в личном кабинете: любая активная (или админ) открывает плагины.
 * Без подписки работает пробный период (resolvePluginTrial).
 */
export async function issuePluginSession(
  userId: string,
  deviceId: string,
  product = "GLAZE"
): Promise<PluginSessionResult | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, password: true, isAdmin: true }
  });
  if (!user) return null;

  const overview = await getSubscriptionOverview(prisma, user.id);
  const subscribed = overview.hasActiveSubscription || user.isAdmin;
  const now = new Date();
  const trial = await resolvePluginTrial(user.id, deviceId, product, !subscribed, now);
  const inTrial = !subscribed && trial.endsAt != null && trial.endsAt.getTime() > now.getTime();

  const active = subscribed || inTrial;
  const plan = overview.currentPlan
    ? String(overview.currentPlan).toLowerCase()
    : user.isAdmin
      ? "admin"
      : inTrial
        ? "trial"
        : trial.used
          ? "trial_ended"
          : null;
  const endsAt = subscribed ? overview.endsAt : trial.endsAt ? trial.endsAt.toISOString() : null;

  const token = createPluginToken({ uid: user.id, did: deviceId, pv: passwordFingerprint(user.password) });
  const license = buildPluginLicense({
    userId: user.id,
    email: user.email,
    name: user.name,
    deviceId,
    active,
    plan,
    endsAt,
    expiresBefore: inTrial ? trial.endsAt!.getTime() : null
  });

  return {
    token,
    license,
    account: { email: user.email, name: user.name ?? "" },
    subscription: { active, plan, endsAt },
    trial: { active: inTrial, endsAt: trial.endsAt ? trial.endsAt.toISOString() : null, used: trial.used },
    subscribeUrl: PLUGIN_SUBSCRIBE_URL
  };
}

export async function getUserPasswordFingerprint(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  return user ? passwordFingerprint(user.password) : null;
}

export function pluginErrorResponse(error: unknown) {
  if (error instanceof PluginLicenseConfigError) {
    console.error("[plugins] license is not configured:", error.message);
    return NextResponse.json({ error: "Subscription check is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  console.error("[plugins] unexpected error", error);
  return NextResponse.json({ error: "Server error. Please try again later." }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
