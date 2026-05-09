import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContractSignedTelegramText,
  buildReleaseModerationTelegramText
} from "@/lib/telegram-notifier";

test("buildContractSignedTelegramText prefers user name and includes email", () => {
  const text = buildContractSignedTelegramText({
    userId: "user_1",
    userName: "Артист",
    userEmail: "artist@example.com"
  });

  assert.equal(
    text,
    "Пользователь Артист - artist@example.com подписал договор. Необходимо его проверить."
  );
});

test("buildContractSignedTelegramText falls back to user id", () => {
  const text = buildContractSignedTelegramText({
    userId: "user_1",
    userName: null,
    userEmail: "artist@example.com"
  });

  assert.equal(
    text,
    "Пользователь user_1 - artist@example.com подписал договор. Необходимо его проверить."
  );
});

test("buildReleaseModerationTelegramText formats release and artist", () => {
  const text = buildReleaseModerationTelegramText({
    releaseTitle: "Новый релиз",
    artistName: "ICECREAMMUSIC"
  });

  assert.equal(text, "Релиз на модерацию: Новый релиз — ICECREAMMUSIC");
});
