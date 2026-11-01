# Telegram relay

The production server cannot reach `api.telegram.org`, so admin notifications
(support tickets, signed contracts, releases on moderation) go through this
Cloudflare Worker instead.

## Deploy

```bash
cd scripts/telegram-relay
npx wrangler@3 login
npx wrangler@3 deploy
openssl rand -hex 32            # the relay secret
npx wrangler@3 secret put RELAY_SECRET
```

`deploy` prints the Worker URL, e.g. `https://icm-telegram-relay.<account>.workers.dev`.

## Point the app at it

Set on the server and restart the app:

```
TELEGRAM_API_BASE="https://icm-telegram-relay.<account>.workers.dev"
TELEGRAM_RELAY_SECRET="<the same secret>"
```

Then, signed in as admin, call `POST /api/admin/support/telegram/test`: a test
message should arrive in the admin group.

Leave `TELEGRAM_API_BASE` empty to send straight to `api.telegram.org`.
