import assert from "node:assert/strict";
import test from "node:test";

import { getContractBirthDateIssue } from "@/lib/contract-verification-shared";

const NOW = new Date(2026, 10, 21, 12, 0, 0);

test("accepts a real birth date in ISO and Russian formats", () => {
  assert.equal(getContractBirthDateIssue("1987-08-25", NOW), null);
  assert.equal(getContractBirthDateIssue("25.08.1987", NOW), null);
});

test("rejects a birth date in the future (year typed as the current one)", () => {
  assert.match(getContractBirthDateIssue("2026-12-25", NOW) ?? "", /в будущем/u);
});

test("rejects a signer younger than 14 years, including this year's date", () => {
  assert.match(getContractBirthDateIssue("2026-08-25", NOW) ?? "", /старше 14/u);
  assert.match(getContractBirthDateIssue("2012-11-22", NOW) ?? "", /старше 14/u);
  assert.equal(getContractBirthDateIssue("2012-11-21", NOW), null);
});

test("rejects empty, malformed, impossible and too old dates", () => {
  assert.equal(getContractBirthDateIssue("", NOW), "Укажите дату рождения.");
  assert.equal(getContractBirthDateIssue(null, NOW), "Укажите дату рождения.");
  assert.match(getContractBirthDateIssue("1987-02-30", NOW) ?? "", /формате/u);
  assert.match(getContractBirthDateIssue("abc", NOW) ?? "", /формате/u);
  assert.equal(getContractBirthDateIssue("1900-01-01", NOW), "Проверьте год рождения.");
});
