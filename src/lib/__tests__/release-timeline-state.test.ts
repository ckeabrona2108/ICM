import assert from "node:assert/strict";
import test from "node:test";

import { getReleaseTimelineState } from "@/lib/release-timeline-state";

test("timeline: draft shows draft as current step", () => {
  const state = getReleaseTimelineState("draft", false);
  assert.equal(state.currentStep, "draft");
  assert.equal(state.activeIndex, 0);
  assert.equal(state.showPayButton, false);
});

test("timeline: moderation + unpaid shows moderation as current step and keeps pay button", () => {
  const state = getReleaseTimelineState("moderation", false);
  assert.equal(state.currentStep, "moderation");
  assert.equal(state.activeIndex, 2);
  assert.equal(state.showPayButton, true);
  assert.equal(state.steps[1]?.label, "Не оплачен");
});

test("timeline: moderation + paid shows moderation as current step", () => {
  const state = getReleaseTimelineState("moderation", true);
  assert.equal(state.currentStep, "moderation");
  assert.equal(state.activeIndex, 2);
  assert.equal(state.showPayButton, false);
});

test("timeline: changes required shows changes step", () => {
  const state = getReleaseTimelineState("changes_required", true);
  assert.equal(state.currentStep, "changes_required");
  assert.equal(state.steps[state.activeIndex]?.label, "Требуются изменения");
  assert.equal(state.showPayButton, false);
});

test("timeline: approved shows published as current step", () => {
  const state = getReleaseTimelineState("approved", true);
  assert.equal(state.currentStep, "published");
  assert.equal(state.activeIndex, state.steps.length - 1);
  assert.equal(state.showPayButton, false);
});
