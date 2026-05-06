import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildActiveDotStyle,
  formatMetricValue
} from "@/components/analytics/analytics-line-chart";

const chartSourcePath = path.resolve(
  process.cwd(),
  "src/components/analytics/analytics-line-chart.tsx"
);
const chartSource = readFileSync(chartSourcePath, "utf8");

test("Hover shows only dot + tooltip", () => {
  assert.ok(chartSource.includes("<Tooltip"));
  assert.ok(chartSource.includes("activeDot={(props"));
  assert.ok(chartSource.includes("<ActiveDotGlow"));
  assert.ok(!chartSource.includes("<Customized"));
});

test("No vertical highlight background", () => {
  assert.ok(!chartSource.includes("<ReferenceArea"));
  assert.ok(!chartSource.includes("rgba(20, 255, 200, 0.18)"));
  assert.ok(!chartSource.includes("analyticsHighlightFadeIn"));
});

test("Tooltip renders expected values formatting", () => {
  assert.equal(formatMetricValue(75735), "75 735");
  assert.equal(formatMetricValue(40167), "40 167");
  assert.equal(formatMetricValue(undefined), "—");
});

test("Active dot is white center with colored outline", () => {
  const dot = buildActiveDotStyle("#4fffd2");
  assert.equal(dot.fill, "#ffffff");
  assert.equal(dot.stroke, "#4fffd2");
  assert.ok(dot.radius >= 4 && dot.radius <= 6);
});
