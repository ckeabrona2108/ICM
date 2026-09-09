import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollaborationPresentation,
  buildCollaborationSearchText,
  encodeStructuredPostContent,
  parseStructuredPostContent
} from "@/lib/collaboration";
import { getReleasePublicListenSummary } from "@/lib/smart-link-service";

test("parses legacy collaboration post metadata without changing stored intent values", () => {
  const stored = `[[ICM_POST_META_V1]]${JSON.stringify({
    type: "collaboration",
    collaboration: {
      intent: "find_producer",
      role: "artist",
      genres: ["pop"],
      preference: "remote",
      bio: "legacy"
    }
  })}\n\nИщу продюсера`;

  const parsed = parseStructuredPostContent(stored);

  assert.equal(parsed.postType, "collaboration");
  assert.equal(parsed.collaboration?.intent, "find_producer");
  assert.equal(parsed.collaboration?.role, "artist");
  assert.equal(parsed.collaboration?.status, "open");
  assert.equal(parsed.collaboration?.workflow, "seeking");
  assert.equal(parsed.collaboration?.customIntentLabel, "");
  assert.equal(parsed.collaboration?.city, "");
  assert.equal(parsed.content, "Ищу продюсера");
});

test("serializes existing collaboration post metadata with backward-compatible prefix", () => {
  const stored = encodeStructuredPostContent({
    content: "Ищу битмейкера",
    collaboration: {
      intent: "find_beatmaker",
      role: "artist",
      status: "open",
      workflow: "seeking",
      customIntentLabel: "",
      genres: ["drill"],
      preference: "hybrid",
      city: "",
      bio: "Нужен новый звук"
    }
  });

  assert.match(stored, /^\[\[ICM_POST_META_V1\]\]/u);
  const parsed = parseStructuredPostContent(stored);
  assert.equal(parsed.collaboration?.intent, "find_beatmaker");
  assert.equal(parsed.collaboration?.role, "artist");
  assert.deepEqual(parsed.collaboration?.genres, ["drill"]);
});

test("legacy intents are grouped only at the UX/domain layer", () => {
  const presentation = buildCollaborationPresentation({
    intent: "distribution",
    role: "engineer"
  });

  assert.equal(presentation.rawIntent, "distribution");
  assert.equal(presentation.intent, "distribution");
  assert.equal(presentation.intentCategory, "OTHER");
  assert.equal(presentation.displayIntent, "Ищу дистрибуцию");
  assert.equal(presentation.displayRole, "Звукорежиссёр");
  assert.equal(presentation.legacyFallback, false);
});

test("unknown collaboration values fall back safely without breaking parsing", () => {
  const presentation = buildCollaborationPresentation({
    intent: "find_superstar",
    role: "orchestrator"
  });

  assert.equal(presentation.rawIntent, "find_superstar");
  assert.equal(presentation.intent, null);
  assert.equal(presentation.intentCategory, "OTHER");
  assert.equal(presentation.displayIntent, "Ищу сотрудничество");
  assert.equal(presentation.rawRole, "orchestrator");
  assert.equal(presentation.role, null);
  assert.equal(presentation.displayRole, "Другое");
  assert.equal(presentation.legacyFallback, true);
});

test("extended collaboration roles map without DB migration", () => {
  const presentation = buildCollaborationPresentation({
    intent: "find_artist",
    role: "mixing_engineer"
  });

  assert.equal(presentation.intentCategory, "LOOKING_FOR_PERSON");
  assert.equal(presentation.role, "mixing_engineer");
  assert.equal(presentation.displayRole, "Звукорежиссёр сведения");
});

test("collaboration search text keeps raw and display values for indexing", () => {
  const searchText = buildCollaborationSearchText({
    content: "Нужен человек в новый проект",
    collaboration: {
      intent: "find_songwriter",
      role: "lyricist",
      workflow: "offering",
      customIntentLabel: "Пишу тексты под поп-рефрены",
      status: "closed",
      preference: "local",
      city: "Москва",
      genres: ["indie"],
      bio: "Пишу на русском"
    },
    author: {
      displayName: "Neon Valley",
      slug: "neon-valley"
    },
    linkedRelease: {
      title: "Night Drive",
      artistName: "Neon Valley",
      platformLinks: [{ label: "VK", code: "vk", href: "https://example.com/vk" }]
    }
  });

  assert.match(searchText, /find_songwriter/u);
  assert.match(searchText, /Предлагаю: Пишу тексты под поп-рефрены/u);
  assert.match(searchText, /offering/u);
  assert.match(searchText, /closed/u);
  assert.match(searchText, /Local/u);
  assert.match(searchText, /Москва/u);
  assert.match(searchText, /OFFERING COLLABORATION/u);
  assert.match(searchText, /lyricist/u);
  assert.match(searchText, /Автор текста/u);
  assert.match(searchText, /Neon Valley/u);
  assert.match(searchText, /neon-valley/u);
  assert.match(searchText, /Night Drive/u);
  assert.match(searchText, /https:\/\/example\.com\/vk/u);
});

test("ordinary posts without collaboration metadata stay ordinary", () => {
  const parsed = parseStructuredPostContent("Обычный пост без structured metadata");

  assert.equal(parsed.postType, "standard");
  assert.equal(parsed.collaboration, null);
  assert.deepEqual(parsed.mediaItems, []);
  assert.equal(parsed.content, "Обычный пост без structured metadata");
});

test("invalid linked release ids do not crash community smart-link enrichment", async () => {
  await assert.doesNotReject(async () => {
    const summary = await getReleasePublicListenSummary("rel_1");
    assert.equal(summary, null);
  });
});
