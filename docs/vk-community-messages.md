# Account events in VK messages

Artists who linked VK (VK ID sign-in or "Привязать ВКонтакте") and allowed messages from the
community `icecreammusicru` get their account events in VK direct messages too. VK is one more
channel of `deliverUserNotification` (`src/lib/vk-notification-channel.ts`): only the artist's own
events go there (`isVkNotificationKind` in `src/lib/vk-messages.ts`: `account_*`, `release_*`,
`report_*`, `payout_*`, `support_reply`), never likes, comments or direct messages. A VK failure is
logged and never breaks the action.

## Permission

`vk_links.messages_allowed` is set by

- the Callback API, `POST /api/vk/callback` (`message_allow` / `message_deny`);
- the "Проверить" button of the cabinet card (`POST /api/vk/messages` → `messages.isMessagesFromGroupAllowed`);
- error 901/902 from `messages.send`, which clears it.

The first permission sends a VK welcome.

## Delayed reminders

`runAccountReminders` (`src/lib/account-lifecycle-notifications.ts`), to all channels, once per
user and key (`user_notification_reminders`), only 09:00–22:00 Moscow time:

| Reminder | When |
| --- | --- |
| "Осталось 3 шага до релиза" | 1 day after signing up (the `account_welcome` notification) without a track |
| Abandoned draft | 2 hours after the last draft change (up to 3 days) |
| "Релиз вышел" → smart link | the release `startDate` has come (up to 3 days) |
| Second release | 3 days after the free single was accepted, if there is no other release |

Call it every 10–15 minutes, like the release payment follow-up:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://www.icecreammusic.net/api/cron/account-reminders
```

## Setup

1. Community → Управление → Сообщения: enable community messages.
2. Работа с API → Ключи доступа: a key with the right "сообщения сообщества" in addition to the
   existing ones (the same key checks group membership). Put it into `VK_GROUP_TOKEN`.
3. Работа с API → Callback API: address `https://www.icecreammusic.net/api/vk/callback`, a secret key,
   events "Разрешение на получение" / "Запрет на получение" (Сообщения). Set
   `VK_CALLBACK_CONFIRMATION` (the string VK shows) and `VK_CALLBACK_SECRET`, restart, press "Подтвердить".
4. Open `GET /api/admin/vk/test` as admin. If VK is unreachable from the server, send through the
   relay: `VK_API_BASE` + `VK_RELAY_SECRET` (see `scripts/telegram-relay/README.md`).
5. Apply migration `20261101190000_vk_community_messages` before deploying the code.
