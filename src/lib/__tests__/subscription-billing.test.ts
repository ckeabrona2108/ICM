// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { SubscriptionPlan } from "@prisma/client";

import {
  mapActivePlanToTariffId,
  getSubscriptionTariffConfig,
  mapPlanToTariffId
} from "@/lib/subscription-billing";

test("getSubscriptionTariffConfig returns expected amount", () => {
  const tariff = getSubscriptionTariffConfig("pro");
  assert.ok(tariff);
  assert.equal(tariff?.amountRub, 990);
});

test("mapPlanToTariffId maps plans to tariff ids", () => {
  assert.equal(mapPlanToTariffId(SubscriptionPlan.STANDARD), "standard");
  assert.equal(mapPlanToTariffId(SubscriptionPlan.FREE), "standard");
  assert.equal(mapPlanToTariffId(SubscriptionPlan.PRO), "pro");
  assert.equal(mapPlanToTariffId(SubscriptionPlan.ENTERPRISE), "enterprise");
  assert.equal(mapPlanToTariffId(undefined), "standard");
});

test("mapActivePlanToTariffId returns null for no active plan", () => {
  assert.equal(mapActivePlanToTariffId(null), null);
  assert.equal(mapActivePlanToTariffId(undefined), null);
  assert.equal(mapActivePlanToTariffId(SubscriptionPlan.STANDARD), "standard");
  assert.equal(mapActivePlanToTariffId(SubscriptionPlan.PRO), "pro");
  assert.equal(mapActivePlanToTariffId(SubscriptionPlan.ENTERPRISE), "enterprise");
  assert.equal(mapActivePlanToTariffId(SubscriptionPlan.LABEL), "enterprise");
});
