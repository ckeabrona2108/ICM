import assert from "node:assert/strict";
import test from "node:test";

import { applyReferralDiscount, nextLadderHint, normalizeReferralCode } from "@/lib/referral-shared";
import { readConfirmedSubscriptionPayment } from "@/lib/subscription-payment-service";

test("the friend's discount is 20%", () => {
  assert.equal(applyReferralDiscount(450), 360);
  assert.equal(applyReferralDiscount(350), 280);
  assert.equal(applyReferralDiscount(990), 792);
});

test("invite codes are short lowercase letters and digits", () => {
  assert.equal(normalizeReferralCode(" AbC7k2xq "), "abc7k2xq");
  assert.equal(normalizeReferralCode("ab"), null);
  assert.equal(normalizeReferralCode("bad code!"), null);
  assert.equal(normalizeReferralCode(42), null);
});

test("the ladder hint counts paying friends to the next step", () => {
  assert.equal(nextLadderHint(0), "Ещё 3 оплативших друга — и месяц PRO твой.");
  assert.equal(nextLadderHint(2), "Ещё 1 оплативший друг — и месяц PRO твой.");
  assert.equal(nextLadderHint(3), "Ещё 2 оплативших друга — и месяц ENTERPRISE твой.");
  assert.equal(nextLadderHint(5), null);
});

test("a subscription paid with the referral discount is accepted", () => {
  const parsed = readConfirmedSubscriptionPayment({
    tariffId: "standard",
    billingPeriod: "monthly",
    amountRub: 280,
    referralDiscountPercent: 20,
    fullAmountRub: 350
  });
  assert.equal(parsed.amountRub, 280);
});

test("a cut price without a real discount record is still rejected", () => {
  assert.throws(() =>
    readConfirmedSubscriptionPayment({ tariffId: "standard", billingPeriod: "monthly", amountRub: 280 })
  );
  assert.throws(() =>
    readConfirmedSubscriptionPayment({
      tariffId: "standard",
      billingPeriod: "monthly",
      amountRub: 100,
      referralDiscountPercent: 20,
      fullAmountRub: 350
    })
  );
});
