import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateExtrasSupplement,
  countReleaseExtras,
  describePendingExtrasSupplement,
  planExtrasSupplement,
  readPendingExtrasSupplement,
  resolveReleaseAmountDue,
  withExtrasSupplement,
  withExtrasSupplementPaid,
  withoutExtrasSupplement
} from "@/lib/release-extras-supplement";

const bare = { text: null, text_sync: null, video: null, video_shot: null };
const withLyrics = { ...bare, text: "куплет" };
const withAll = { text: "куплет", text_sync: "s3://k.ttml", video: "s3://v.mp4", video_shot: "s3://v.mp4" };

test("countReleaseExtras counts tracks per extra, one video per track", () => {
  assert.deepEqual(countReleaseExtras([bare, withLyrics, withAll]), { lyrics: 2, karaoke: 1, video: 1 });
});

test("lyrics, karaoke and video added to an approved release are charged, base fee is not", () => {
  const price = calculateExtrasSupplement([withAll, withAll], countReleaseExtras([bare, bare]));
  assert.equal(price.lines.some((line) => line.kind === "base"), false);
  assert.equal(price.totalRub, 2 * 75 + 2 * 75 + 2 * 150);
});

test("extras that were already paid, removed or moved between tracks cost nothing", () => {
  assert.equal(calculateExtrasSupplement([withAll], countReleaseExtras([withAll])).totalRub, 0);
  assert.equal(calculateExtrasSupplement([bare], countReleaseExtras([withAll])).totalRub, 0);
  assert.equal(calculateExtrasSupplement([bare, withLyrics], countReleaseExtras([withLyrics, bare])).totalRub, 0);
});

test("planExtrasSupplement: subscribers have extras included", () => {
  assert.equal(planExtrasSupplement({ paidTracks: [bare], nextTracks: [withAll], extrasIncluded: true }), null);
  const plan = planExtrasSupplement({ paidTracks: [bare], nextTracks: [withLyrics], extrasIncluded: false });
  assert.equal(plan?.price.totalRub, 75);
});

test("a pending supplement keeps its baseline when the artist edits again", () => {
  const roles = withExtrasSupplement({}, { paid: { lyrics: 0, karaoke: 0, video: 0 }, amountRub: 75 });
  const pending = readPendingExtrasSupplement(roles);
  // The unpaid lyrics are already in the stored tracks; they must still be charged.
  const plan = planExtrasSupplement({ paidTracks: [withLyrics], nextTracks: [withLyrics], pending, extrasIncluded: false });
  assert.equal(plan?.price.totalRub, 75);
});

test("resolveReleaseAmountDue charges the supplement only, and the full price without one", () => {
  const roles = withExtrasSupplement({ submissionData: {} }, { paid: countReleaseExtras([bare]), amountRub: 150, sourceReleaseId: "r1" });
  assert.deepEqual(resolveReleaseAmountDue(roles, [{ ...bare, video: "v" }]), {
    supplement: true,
    price: { lines: [{ kind: "video", label: "Видео", unitRub: 150, count: 1, amountRub: 150 }], totalRub: 150 }
  });
  const full = resolveReleaseAmountDue({}, [withLyrics]);
  assert.equal(full.supplement, false);
  assert.equal(full.price.totalRub, 450 + 75);
});

test("a paid supplement no longer prices the release; labels follow", () => {
  const roles = withExtrasSupplement({}, { paid: countReleaseExtras([bare]), amountRub: 75 });
  assert.equal(describePendingExtrasSupplement(roles, false), "Ждёт доплату за дополнения: 75 ₽");
  assert.equal(describePendingExtrasSupplement(roles, true), null);
  const paid = withExtrasSupplementPaid(roles, { orderId: "o1" });
  assert.equal(readPendingExtrasSupplement(paid), null);
  assert.equal(resolveReleaseAmountDue(paid, [withLyrics]).supplement, false);
  assert.equal("extrasSupplement" in withoutExtrasSupplement(roles), false);
});
