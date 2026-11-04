import assert from "node:assert/strict";
import test from "node:test";

import { collectGuideLinks, parseGuideInline, pickRelatedGuides, stripGuideLinks } from "@/lib/guide-types";
import { GUIDE_CATEGORIES, GUIDES, getGuide, getGuidesByCategory } from "@/lib/guides";

const slugs = new Set(GUIDES.map((guide) => guide.slug));

test("guide inline links parse into text and link parts", () => {
  assert.deepEqual(parseGuideInline("Смотрите [гайд](/guides/a) и [ещё](/karaoke)."), [
    { type: "text", text: "Смотрите " },
    { type: "link", text: "гайд", href: "/guides/a" },
    { type: "text", text: " и " },
    { type: "link", text: "ещё", href: "/karaoke" },
    { type: "text", text: "." }
  ]);
  assert.deepEqual(parseGuideInline("без ссылок"), [{ type: "text", text: "без ссылок" }]);
  assert.equal(stripGuideLinks("Смотрите [гайд](/guides/a)."), "Смотрите гайд.");
});

test("guides have unique slugs and complete SEO fields", () => {
  assert.equal(slugs.size, GUIDES.length);
  const seoTitles = new Set(GUIDES.map((guide) => guide.seoTitle));
  const descriptions = new Set(GUIDES.map((guide) => guide.description));
  assert.equal(seoTitles.size, GUIDES.length, "seoTitle must be unique");
  assert.equal(descriptions.size, GUIDES.length, "description must be unique");

  for (const guide of GUIDES) {
    assert.match(guide.slug, /^[a-z0-9-]+$/, guide.slug);
    assert.ok(guide.seoTitle.length <= 60, `${guide.slug}: seoTitle is ${guide.seoTitle.length} chars`);
    assert.ok(
      guide.description.length >= 80 && guide.description.length <= 200,
      `${guide.slug}: description is ${guide.description.length} chars`
    );
    assert.ok(guide.keywords.length >= 3, `${guide.slug}: keywords`);
    assert.ok(GUIDE_CATEGORIES.some((category) => category.id === guide.category), `${guide.slug}: category`);
    assert.ok(guide.blocks.filter((block) => block.type === "h2").length >= 2, `${guide.slug}: needs h2 sections`);
    assert.equal(guide.blocks.filter((block) => block.type === "cta").length, 1, `${guide.slug}: needs one CTA`);
    assert.ok(guide.faq.length >= 3, `${guide.slug}: needs FAQ`);
    assert.ok(!Number.isNaN(Date.parse(guide.publishedAt)) && !Number.isNaN(Date.parse(guide.updatedAt)));
    assert.ok(guide.updatedAt >= guide.publishedAt, `${guide.slug}: updatedAt before publishedAt`);
    assert.equal(getGuide(guide.slug), guide);
  }
});

test("guide inline and related links point to existing guides", () => {
  for (const guide of GUIDES) {
    const links = collectGuideLinks(guide);
    assert.ok(links.length >= 1, `${guide.slug}: needs at least one inline link`);
    for (const href of links) {
      if (!href.startsWith("/guides/")) continue;
      const target = href.slice("/guides/".length);
      assert.ok(slugs.has(target), `${guide.slug}: broken link ${href}`);
      assert.notEqual(target, guide.slug, `${guide.slug}: links to itself`);
    }
    for (const slug of guide.related ?? []) {
      assert.ok(slugs.has(slug) && slug !== guide.slug, `${guide.slug}: bad related ${slug}`);
    }
  }
});

test("every guide is linked from at least one other guide", () => {
  const linked = new Set<string>();
  for (const guide of GUIDES) {
    for (const href of collectGuideLinks(guide)) linked.add(href.replace("/guides/", ""));
    for (const slug of guide.related ?? []) linked.add(slug);
  }
  for (const guide of GUIDES) assert.ok(linked.has(guide.slug), `${guide.slug} is an orphan`);
});

test("related guides prefer explicit picks, then the same category", () => {
  const guide = GUIDES.find((item) => (item.related ?? []).length > 0)!;
  const related = pickRelatedGuides(guide, GUIDES, 3);
  assert.equal(related.length, 3);
  assert.equal(related[0].slug, guide.related![0]);
  assert.ok(related.every((item) => item.slug !== guide.slug));
  assert.equal(new Set(related.map((item) => item.slug)).size, related.length);
});

test("guides are grouped by category in a stable order", () => {
  const groups = getGuidesByCategory();
  assert.equal(groups.reduce((sum, group) => sum + group.guides.length, 0), GUIDES.length);
});
