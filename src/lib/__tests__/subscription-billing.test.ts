// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import type { SubscriptionPlan } from "@/lib/legacy-business-enums";

import {
  calculateSubscriptionEndDate,
  mapActivePlanToTariffId,
  getSubscriptionTariffConfig,
  mapPlanToTariffId,
  isAcceptedSubscriptionAmount
} from "@/lib/subscription-billing";

test("getSubscriptionTariffConfig returns expected amount", () => {
  const tariff = getSubscriptionTariffConfig("pro");
  assert.ok(tariff);
  assert.equal(tariff?.amountRub, 990);
});

test("getSubscriptionTariffConfig returns yearly pricing metadata", () => {
  const tariff = getSubscriptionTariffConfig("standard", "yearly");
  assert.ok(tariff);
  assert.equal(tariff?.amountRub, 2520);
  assert.equal(tariff?.durationMonths, 12);
  assert.equal(tariff?.yearlyMonthlyEquivalentRub, 210);
  assert.equal(tariff?.yearlySavingsRub, 1680);
  assert.equal(tariff?.yearlySavingsPercent, 40);
});

test("yearly price is 40% off twelve months on every tariff", () => {
  assert.equal(getSubscriptionTariffConfig("standard")?.amountRub, 350);
  assert.equal(getSubscriptionTariffConfig("pro", "yearly")?.amountRub, 7128);
  assert.equal(getSubscriptionTariffConfig("enterprise", "yearly")?.amountRub, 14328);
});

test("a payment started at the old price is still accepted", () => {
  assert.equal(isAcceptedSubscriptionAmount("standard", "monthly", 350), true);
  assert.equal(isAcceptedSubscriptionAmount("standard", "monthly", 550), true);
  assert.equal(isAcceptedSubscriptionAmount("standard", "yearly", 5490), true);
  assert.equal(isAcceptedSubscriptionAmount("standard", "monthly", 100), false);
  assert.equal(isAcceptedSubscriptionAmount("pro", "monthly", 550), false);
});

test("calculateSubscriptionEndDate extends yearly subscriptions by 12 months", () => {
  const now = new Date("2026-07-12T00:00:00.000Z");
  const end = calculateSubscriptionEndDate({
    billingPeriod: "yearly",
    now
  });

  assert.equal(end.toISOString(), "2027-07-12T00:00:00.000Z");
});

test("mapPlanToTariffId maps plans to tariff ids", () => {
  assert.equal(mapPlanToTariffId("STANDARD" as SubscriptionPlan), "standard");
  assert.equal(mapPlanToTariffId("FREE" as SubscriptionPlan), "standard");
  assert.equal(mapPlanToTariffId("PRO" as SubscriptionPlan), "pro");
  assert.equal(mapPlanToTariffId("ENTERPRISE" as SubscriptionPlan), "enterprise");
  assert.equal(mapPlanToTariffId(undefined), "standard");
});

test("mapActivePlanToTariffId returns null for no active plan", () => {
  assert.equal(mapActivePlanToTariffId(null), null);
  assert.equal(mapActivePlanToTariffId(undefined), null);
  assert.equal(mapActivePlanToTariffId("STANDARD" as SubscriptionPlan), "standard");
  assert.equal(mapActivePlanToTariffId("PRO" as SubscriptionPlan), "pro");
  assert.equal(mapActivePlanToTariffId("ENTERPRISE" as SubscriptionPlan), "enterprise");
  assert.equal(mapActivePlanToTariffId("LABEL" as SubscriptionPlan), "enterprise");
});
