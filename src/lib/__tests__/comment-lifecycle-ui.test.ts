import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("feed comments expose canonical anchors and owner lifecycle actions", async () => {
  const [socialUi, feedUi, detailUi] = await Promise.all([
    readFile(new URL("../../components/ui/tripled-social.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/feed/public-feed-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/feed/feed-detail-page.tsx", import.meta.url), "utf8")
  ]);
  assert.match(socialUi, /id=\{`comment-\$\{id\}`\}/);
  assert.match(feedUi, /aria-label="Изменить публикацию"/);
  assert.match(feedUi, /onEditComment\(comment\)/);
  assert.match(feedUi, /onDeleteComment\(comment\)/);
  assert.match(feedUi, /onReactComment\(comment\)/);
  assert.match(feedUi, /comment\.editedAt \? " · изменено"/);
  assert.match(detailUi, /Изменить публикацию/);
  assert.doesNotMatch(detailUi, /window\.prompt\("Изменить публикацию"/);
  assert.match(detailUi, /onEdit=\{onEdit\}/);
  assert.match(detailUi, /onReact=\{onReact\}/);
  assert.match(detailUi, /Откликнуться/);
  assert.match(detailUi, /Закрыть объявление/);
  assert.match(detailUi, /<EditPostDialog/);
  assert.match(detailUi, /<CollaborationResponseDialog/);
});

test("comment routes use the agreed PATCH body and nested reaction contract", async () => {
  const [postComments, releaseComments, postReaction, releaseReaction] = await Promise.all([
    readFile(new URL("../../app/api/artists/posts/[id]/comments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/scene/releases/[id]/comments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/artists/posts/[id]/comments/[commentId]/like/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/scene/releases/[id]/comments/[commentId]/like/route.ts", import.meta.url), "utf8")
  ]);
  assert.match(postComments, /export async function PATCH/);
  assert.match(releaseComments, /export async function PATCH/);
  assert.match(postComments, /parsed\.data\.commentId/);
  assert.match(releaseComments, /parsed\.data\.commentId/);
  assert.match(postReaction, /context: \{ params: \{ id: string; commentId: string \} \}/);
  assert.match(releaseReaction, /context: \{ params: \{ id: string; commentId: string \} \}/);
});

test("post and comment creates send stable client idempotency keys on both feed surfaces", async () => {
  const [feedUi, detailUi] = await Promise.all([
    readFile(new URL("../../components/feed/public-feed-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/feed/feed-detail-page.tsx", import.meta.url), "utf8")
  ]);
  assert.match(feedUi, /mutationKeysRef\.current\.acquire\("post-composer", postDraftFingerprint\)/);
  assert.ok((feedUi.match(/"Idempotency-Key": idempotencyKey/g) ?? []).length >= 3);
  assert.match(feedUi, /mutationKeysRef\.current\.complete\(mutationSlot, idempotencyKey\)/);
  assert.match(detailUi, /"Idempotency-Key": idempotencyKey/);
  assert.match(detailUi, /invalidateIfChanged\(socialCommentMutationSlot/);
});

test("feed dialogs do not refocus controlled fields after every parent rerender", async () => {
  const dialogs = await readFile(new URL("../../components/feed/feed-shared-dialogs.tsx", import.meta.url), "utf8");

  assert.match(dialogs, /const busyRef = React\.useRef\(busy\)/);
  assert.match(dialogs, /const onCloseRef = React\.useRef\(onClose\)/);
  assert.match(dialogs, /busyRef\.current = busy/);
  assert.match(dialogs, /onCloseRef\.current = onClose/);
  assert.match(dialogs, /onCloseRef\.current\(\)/);
  assert.doesNotMatch(dialogs, /\}, \[busy, onClose, open\]\);/);
});
