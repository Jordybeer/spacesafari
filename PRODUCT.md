# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are friends attending a festival together in a Telegram group. They need quick, low-friction answers and coordination while moving around a busy festival site on a phone.

One member acts as the festival owner or group administrator. They create the festival privately with Ginder, connect its Telegram group, and complete setup before the group tools become available.

## Product Purpose

Ginder is a reusable Telegram festival companion. It keeps the timetable, artist reminders, festival map, meeting point, tent locations, and opt-in group presence together in the Telegram context a festival group already uses.

Success means a group can set up its festival once, then answer “what is on now?”, find people and places, coordinate a meetup, and receive timely artist reminders with minimal typing and no separate app installation.

Space Safari 2026 is the first built-in festival instance and the verified reference implementation for the broader Ginder product.

## Positioning

Ginder turns a group's own festival map and timetable into a Telegram-native shared companion: group-scoped commands, a calibrated live Mini App map, and durable reminders operate as one festival-specific room rather than as separate generic tools.

## Operating Context

- Attendees primarily use Ginder on phones inside a Telegram group and its Mini App during a multi-day festival.
- The environment can be noisy, crowded, outdoors, battery-constrained, and poorly connected. Answers should be glanceable and essential map assets should remain useful under weak connectivity.
- Festival creation and unfinished setup happen privately with the owner; attendee tools live in the connected festival group.
- Setup proceeds in four guided steps: upload the festival map, define the terrain location and size, place 2–6 GPS-to-image anchors, and provide the timetable.
- The illustrated festival map is not assumed to be georeferenced. Calibration anchors map real GPS positions onto the supplied festival artwork.

## Capabilities and Constraints

- A festival owner can create, select, manage, archive, restore, connect, and disconnect festivals through the private Telegram bot flow.
- Group tools cover the current and upcoming timetable, artist search, reminders, map access, group status, meeting points, and saved tent locations.
- The map supports a public room and private group rooms. Group rooms are isolated by opaque tokens derived from Telegram group context.
- Live location sharing is explicit opt-in. Other clients receive projected map position and freshness/accuracy metadata; raw GPS is temporary and route history is not retained.
- Group presence is reciprocal: a member shares their own location to see other live group members. Meeting points and tent locations remain visible without live presence.
- Space Safari timetable spelling, stage, and time come from the supplied official timetable images. Unknown secondary artist metadata remains explicitly unverified rather than guessed.
- Custom festivals are scoped independently in storage. Existing Space Safari production data retains its historical storage namespace for compatibility.
- The production stack is Next.js, React, TypeScript, Vercel Functions, Telegram Bot API and Mini Apps, Upstash Redis, Vercel Queues, MapLibre, Luxon, Zod, and Vitest.
- Ginder is currently an unofficial community product. Festival-provided map and timetable assets must not be presented as official or redistributed publicly without permission.

## Brand Commitments

- Product name: Ginder.
- Voice: direct, compact, practical Dutch suited to quick phone use; technical identifiers stay out of primary attendee-facing copy.
- Space Safari remains a named festival instance, not the umbrella product identity.
- The existing Ginder name, pin mark, app icons, and Telegram bot identity are durable assets.

## Evidence on Hand

- `README.md` documents the working Space Safari instance, feature set, privacy model, deployment stack, and verified timetable totals.
- `src/data/schedule/`, `src/data/timetable.ts`, `src/data/verification.ts`, and `docs/timetable-verification.md` contain and validate the Space Safari 2026 schedule source of truth.
- `public/festival-map-original.png` is the current Space Safari map asset; `public/ginder-icon.svg` and the PNG icon set are the current Ginder identity assets.
- `src/lib/festival-bot-router.ts`, `src/lib/group-companion-router.ts`, and `src/lib/telegram-command-ui.ts` implement the owner and attendee Telegram workflows.
- `app/map/` implements the calibrated festival map and opt-in group presence; `docs/map-calibration.md` and `docs/mobile-map-ux.md` record its field and mobile constraints.
- Automated tests cover timetable integrity, festival isolation and recovery, onboarding privacy, reminders, map projection, location sharing, webhook security, and offline multi-festival behavior.
- No testimonials, adoption metrics, official festival partnerships, pricing, or public redistribution rights are established; future work must not fabricate them.

## Product Principles

1. Stay inside the group's existing Telegram flow whenever the task can be completed there.
2. Optimize for fast, glanceable festival use under imperfect attention and connectivity.
3. Make location sharing explicit, temporary, reciprocal, and festival-scoped.
4. Preserve source truth and label uncertainty instead of filling gaps with guesses.
5. Keep owner setup private and guided; expose attendee tools only when the festival is ready.

## Accessibility & Inclusion

- Support Telegram content-safe-area insets and mobile browser safe areas so controls do not collide with platform chrome.
- Do not rely on color alone for live/offline, ownership, or location state.
- Keep primary touch targets usable on a moving, one-handed phone and respect reduced-motion preferences.
