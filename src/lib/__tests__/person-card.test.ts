import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PersonCard } from "@/components/feed/person-card";
import type { FeedPersonCard } from "@/lib/feed-contract";

function makePerson(overrides: Partial<FeedPersonCard> = {}): FeedPersonCard {
  return {
    userId: "user-1",
    slug: "artist-1",
    displayName: "Artist One",
    profileType: "artist",
    city: "",
    bio: "",
    genres: ["Другое", "Pop"],
    avatarUrl: null,
    releaseCount: 1,
    collaborationOpen: false,
    collaborationRole: null,
    displayRole: null,
    portfolio: [{ id: "release-1", title: "Release One", releaseDate: "2026-08-01T00:00:00.000Z" }],
    ...overrides
  };
}

test("person card does not show generic discovery role fallback as meaningful metadata", () => {
  const html = renderToStaticMarkup(React.createElement(PersonCard, {
    person: makePerson({
      collaborationRole: "other",
      displayRole: "Другое"
    })
  }));

  assert.match(html, /Профиль: Артист/u);
  assert.match(html, />Pop</u);
  assert.doesNotMatch(html, />Другое</u);
  assert.doesNotMatch(html, /Роль не указана/u);
});

test("person card shows explicit collaboration role when it exists", () => {
  const html = renderToStaticMarkup(React.createElement(PersonCard, {
    person: makePerson({
      collaborationRole: "producer",
      displayRole: "Продюсер"
    })
  }));

  assert.match(html, /Продюсер/u);
  assert.match(html, /Профиль: Артист/u);
});
