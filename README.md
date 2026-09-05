# Space Safari Assistant 🛸

Unofficial community Telegram assistant + Mini App for Space Safari 2026 at Domaine de Massembre.

It combines the verified festival timetable with fast Telegram commands, durable artist reminders, the festival terrain map and an opt-in multi-user live map.

## Features

- `/wie` shows every artist playing now and the next artist on the same stage.
- `/straks` shows sets starting in the next 60 minutes.
- `/programma <artist>` searches the timetable.
- `/ping <artist>` schedules a durable notification 15 minutes before the set.
- `/pings` lists active notifications.
- `/unping <artist>` removes them.
- `/map` sends the terrain map and opens the Telegram Mini App.
- Private group rooms use opaque room IDs derived from the Telegram group context.
- **Space Safari Live** is an opt-in public room for campers/festival visitors.
- Telegram name/username and profile image can be shown next to live markers.
- `/mapadmin` opens calibration mode: record your current GPS location, tap the matching point on the illustrated map, give it a name, and save it as an anchor.
- Markers expire after 15 minutes and no movement history is stored.
- The map shell and terrain image are cached for weak festival connectivity.

## Timetable source of truth

Timing, stage and spelling come from the three supplied Space Safari timetable images for Friday 04.09.26, Saturday 05.09.26 and Sunday 06.09.26. The canonical data is exported from `src/data/timetable.ts`.

Verified totals:

- 106 performer sets
- 116 schedule rows including breaks/soundchecks
- Friday 21 sets
- Saturday 44 sets
- Sunday 41 sets
- Supernova 28, Nebula 33, Zodiac 23, Galaxy 22

Artist genre/country metadata is separate. Unknown values remain `Unverified` rather than being guessed. See `docs/timetable-verification.md`.

## Stack

Next.js 16, React 19, TypeScript, Vercel Functions, Telegram Bot API webhook + Mini App, Luxon, Upstash Redis, Upstash QStash, Zod and Vitest.

## Environment

Copy `.env.example` and configure the same keys in Vercel. Never commit real secrets.

Important variables:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MINI_APP_SHORT_NAME=
APP_URL=https://your-custom-domain.example
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
MAP_ROOM_SECRET=
MAP_ADMIN_TELEGRAM_IDS=
WEBHOOK_ADMIN_SECRET=
```

`APP_URL` must be the final HTTPS origin without a trailing slash because Telegram webhooks and QStash signature verification are URL-sensitive.

## Telegram setup

1. Create/select the bot in BotFather.
2. Configure a Mini App pointing to `https://<APP_URL>/map`.
3. Put its short name in `TELEGRAM_MINI_APP_SHORT_NAME` and the bot username in `TELEGRAM_BOT_USERNAME`.
4. Add the bot to your Telegram group.
5. Set all Vercel environment variables and deploy.
6. Register the webhook with the protected endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer $WEBHOOK_ADMIN_SECRET" \
  https://<APP_URL>/api/telegram/register-webhook
```

The endpoint registers `POST /api/telegram/webhook`, installs the command menu and uses Telegram's webhook secret-token verification. You can remove `WEBHOOK_ADMIN_SECRET` after setup to disable the endpoint.

## Artist reminders

`/ping Sevenum Six` stores an `ArtistPing` in Redis and publishes a delayed QStash message for 15 minutes before the official set start. Delivery validates the QStash signature, checks the ping still exists, uses a Redis lock for idempotency, sends once and marks it sent. It does not use `setTimeout` or serverless process memory.

## Live map and calibration

The terrain map is illustrative rather than a georeferenced survey. The app therefore learns a GPS → image transform from calibration anchors. With two anchors it can estimate scale/rotation; with three or more nearby non-collinear anchors it uses a local affine projection.

To calibrate:

1. Add your numeric Telegram user ID to `MAP_ADMIN_TELEGRAM_IDS`.
2. Run `/mapadmin`.
3. Walk to a known landmark such as Entrance, Galaxy, Nebula, Zodiac or Supernova.
4. Tap **Neem huidige GPS**, then tap the same landmark on the festival image.
5. Give it a name and save.
6. Repeat across the site.

See `docs/map-calibration.md` for details.

## Local verification

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same correctness gates on pull requests.

## Privacy

Live location is explicit opt-in. Public and group rooms only expose projected map position plus freshness/accuracy metadata to other clients. Raw GPS is stored temporarily with a 15-minute TTL and no route/history is retained.

## Asset note

This is an unofficial community tool. If you publish it beyond your own festival group, confirm permission to redistribute festival-provided map/timetable imagery and do not present it as an official Space Safari service.
