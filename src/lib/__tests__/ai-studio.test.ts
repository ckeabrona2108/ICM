import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAiTokenAmount,
  formatTokenUsdValue,
  getAiStudioSubscriptionBonusTokensByTariffId,
  getAiStudioEntitlements,
  hasAiStudioAccess,
  resolveAiStudioGenerationCostTokens,
  resolveAiStudioPlan
} from "@/lib/ai-studio";

test("professional subscriber gets PRO access and limits", () => {
  const input = {
    isSubscribed: true,
    subscribeLevel: "professional" as const,
    expiresAt: new Date(Date.now() + 86_400_000)
  };

  assert.equal(resolveAiStudioPlan(input), "PRO");
  assert.equal(hasAiStudioAccess(input), true);

  const entitlements = getAiStudioEntitlements(input);
  assert.equal(entitlements.monthlyBonusTokens, 1000);
  assert.equal(entitlements.dailyLimits.imagesPerDay, 20);
  assert.equal(entitlements.dailyLimits.audioPerDay, 10);
  assert.equal(entitlements.dailyLimits.videoPerDay, 5);
  assert.equal(entitlements.dailyLimits.chatMessagesPerDay, 100);
  assert.equal(entitlements.fileLimits.videoMb, 200);
});

test("enterprise and premium map to ENTERPRISE access", () => {
  const premium = {
    isSubscribed: true,
    subscribeLevel: "premium" as const,
    expiresAt: new Date(Date.now() + 86_400_000)
  };
  const enterprise = {
    isSubscribed: true,
    subscribeLevel: "enterprise" as const,
    expiresAt: new Date(Date.now() + 86_400_000)
  };

  assert.equal(resolveAiStudioPlan(premium), "ENTERPRISE");
  assert.equal(resolveAiStudioPlan(enterprise), "ENTERPRISE");
  assert.equal(getAiStudioEntitlements(enterprise).dailyLimits.imagesPerDay, null);
  assert.equal(getAiStudioEntitlements(enterprise).fileLimits.videoMb, 1024);
});

test("expired or inactive subscriptions lose access", () => {
  const expired = {
    isSubscribed: true,
    subscribeLevel: "professional" as const,
    expiresAt: new Date(Date.now() - 86_400_000)
  };
  const inactive = {
    isSubscribed: false,
    subscribeLevel: "enterprise" as const,
    expiresAt: new Date(Date.now() + 86_400_000)
  };

  assert.equal(resolveAiStudioPlan(expired), "FREE");
  assert.equal(resolveAiStudioPlan(inactive), "FREE");
  assert.equal(hasAiStudioAccess(expired), false);
  assert.equal(getAiStudioEntitlements(inactive).monthlyBonusTokens, 0);
});

test("token formatting stays human readable", () => {
  assert.equal(formatAiTokenAmount(4850).replace(/\s/g, ""), "4850");
  assert.equal(formatTokenUsdValue(10000), "$10.00");
});

test("subscription bonus tokens respect billing period for PRO and ENTERPRISE", () => {
  assert.equal(getAiStudioSubscriptionBonusTokensByTariffId("pro", "monthly"), 1000);
  assert.equal(getAiStudioSubscriptionBonusTokensByTariffId("enterprise", "monthly"), 2500);
  assert.equal(getAiStudioSubscriptionBonusTokensByTariffId("pro", "yearly"), 5000);
  assert.equal(getAiStudioSubscriptionBonusTokensByTariffId("enterprise", "yearly"), 20000);
});

test("video duration pricing matches the AI Studio matrix", () => {
  assert.equal(
    resolveAiStudioGenerationCostTokens({
      section: "video",
      modelCode: "xai/grok-imagine-video/text-to-video",
      modelPriceTokens: 500,
      parameters: { Duration: "5 sec" }
    }),
    250
  );
  assert.equal(
    resolveAiStudioGenerationCostTokens({
      section: "video",
      modelCode: "veo3.1",
      modelPriceTokens: 4000,
      parameters: { Duration: "10 sec" }
    }),
    4000
  );
  assert.equal(
    resolveAiStudioGenerationCostTokens({
      section: "image",
      modelCode: "flux-pro/v1.1-ultra",
      modelPriceTokens: 60
    }),
    60
  );
});
