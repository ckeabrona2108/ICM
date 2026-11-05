// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { mapAdminReleaseDetails } from "@/lib/admin-release-details";
import { carryReleaseEditsToTrack, normalizePersonGroups, toWizardPersons } from "@/lib/admin-release-edit";

const submittedRelease = (roles: Record<string, unknown>) => ({
  id: "rel_1",
  title: "ПУСКАЙ",
  performer: "Andrey Shvedov/ Андрей Шведов",
  status: "moderating",
  type: "single",
  roles: {
    submissionData: {
      title: "ПУСКАЙ",
      persons: [{ name: "Andrey Shvedov/ Андрей Шведов", role: "Исполнитель" }]
    },
    ...roles
  },
  track: [{ id: "trk_1", title: "ПУСКАЙ", index: 1, roles: {} }]
});

test("before any admin edit, release performers come from what the artist submitted", () => {
  const details = mapAdminReleaseDetails(submittedRelease({}));
  assert.deepEqual(details.release.roles.performers, ["Andrey Shvedov/ Андрей Шведов"]);
});

test("an admin rename of the release performer replaces the old nickname", () => {
  const details = mapAdminReleaseDetails({
    ...submittedRelease({ adminPersons: { performers: ["Andrey Shvedov"], feats: [] } }),
    // The route also rewrites the flat column; even if it lagged behind, the admin list wins.
    performer: "Andrey Shvedov/ Андрей Шведов"
  });
  assert.deepEqual(details.release.roles.performers, ["Andrey Shvedov"]);
});

test("an admin can remove a feat from the release", () => {
  const release = submittedRelease({ adminPersons: { performers: ["Artist"], feats: [] } });
  release.roles.submissionData.persons.push({ name: "Old Feat", role: "feat." });
  const details = mapAdminReleaseDetails(release);
  assert.deepEqual(details.release.roles.feats, []);
});

test("admin groups are written back in the wizard's persons format", () => {
  assert.deepEqual(
    toWizardPersons(normalizePersonGroups({ performers: ["A"], feats: ["B"], lyricsAuthors: ["C", " c "] })),
    [
      { name: "A", role: "Исполнитель" },
      { name: "B", role: "feat." },
      { name: "C", role: "Автор слов" }
    ]
  );
});

const carry = (overrides = {}) =>
  carryReleaseEditsToTrack({
    isSingle: true,
    releaseTitleBefore: "ПУСКАЙ",
    releaseTitleAfter: "ПУСКАЙ",
    releasePerformersBefore: ["Old Nick"],
    releasePerformersAfter: ["Old Nick"],
    trackTitleBefore: "ПУСКАЙ",
    trackTitleIncoming: "ПУСКАЙ",
    trackPerformersBefore: ["Old Nick"],
    trackPerformersIncoming: ["Old Nick"],
    ...overrides
  });

test("renaming a single renames its track too", () => {
  assert.equal(carry({ releaseTitleAfter: "Пускай (Remix)" }).title, "Пускай (Remix)");
});

test("a track title the admin changed by hand is kept", () => {
  assert.equal(carry({ releaseTitleAfter: "Новое", trackTitleIncoming: "Своё" }).title, "Своё");
});

test("an album track keeps its own title when the album is renamed", () => {
  assert.equal(carry({ isSingle: false, releaseTitleAfter: "Новое" }).title, "ПУСКАЙ");
});

test("a new release nickname reaches tracks that listed the old one", () => {
  assert.deepEqual(carry({ releasePerformersAfter: ["New Nick"] }).performers, ["New Nick"]);
});

test("a track with a different performer is not overwritten", () => {
  assert.deepEqual(
    carry({
      releasePerformersAfter: ["New Nick"],
      trackPerformersBefore: ["Guest"],
      trackPerformersIncoming: ["Guest"]
    }).performers,
    ["Guest"]
  );
});
