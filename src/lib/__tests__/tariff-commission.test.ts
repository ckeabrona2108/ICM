import assert from "node:assert/strict";
import test from "node:test";

import { mergeReleaseRolesPaymentUsage, type ReleasePaymentUsage } from "@/lib/release-quota";
import {
  describeCommissionBasis,
  readCommissionBasis,
  readGlobalCommissionPayment,
  resolveReleaseTariffCommission
} from "@/lib/tariff-commission";

function roles(usage: Partial<ReleasePaymentUsage> & { type: ReleasePaymentUsage["type"] }): unknown {
  return mergeReleaseRolesPaymentUsage(null, { usedAt: "2026-11-20T00:00:00.000Z", ...usage });
}

test("a release keeps the rate of the subscription it was sent under", () => {
  assert.deepEqual(resolveReleaseTariffCommission(roles({ type: "subscription", plan: "STANDARD" })), {
    rate: 0.1,
    basis: { kind: "tariff", plan: "STANDARD" }
  });
  assert.equal(resolveReleaseTariffCommission(roles({ type: "subscription", plan: "PRO" }))?.rate, 0.05);
  assert.equal(resolveReleaseTariffCommission(roles({ type: "subscription", plan: "ENTERPRISE" }))?.rate, 0);
});

test("pay-as-you-go, partner code, free single and old releases fall back to the global rate", () => {
  assert.equal(resolveReleaseTariffCommission(roles({ type: "standalone_payment" })), null);
  assert.equal(resolveReleaseTariffCommission(roles({ type: "partner_code" })), null);
  assert.equal(resolveReleaseTariffCommission(roles({ type: "free_first_release" })), null);
  assert.equal(resolveReleaseTariffCommission({}), null);
  assert.equal(readGlobalCommissionPayment(roles({ type: "free_first_release" }), true), "free_first_release");
  assert.equal(readGlobalCommissionPayment({}, true), "unknown");
  assert.equal(readGlobalCommissionPayment(null, false), "no_release");
});

test("admin labels say why the rate was taken", () => {
  assert.equal(describeCommissionBasis({ kind: "tariff", plan: "ENTERPRISE" }, 0), "Подписка ENTERPRISE · 0%");
  assert.equal(describeCommissionBasis({ kind: "tariff", plan: "PRO" }, 0.05), "Подписка PRO · 5%");
  assert.equal(describeCommissionBasis({ kind: "global", payment: "standalone_payment" }, 0.1), "Общая ставка (разовая оплата) · 10%");
  assert.equal(describeCommissionBasis(readCommissionBasis({ kind: "user" })), "Индивидуальная ставка");
  assert.equal(readCommissionBasis({ kind: "tariff", plan: "BAD" }), null);
});
