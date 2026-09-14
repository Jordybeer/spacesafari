# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are friends attending a festival together in a Telegram group. They need quick, low-friction answers and coordination while moving around a busy festival site on a phone.

Festival definitions are curated centrally by the Ginder operator. Attendees do not create maps, place calibration anchors, or configure georeferencing; they choose a published festival and use its prepared map. A trusted operator or verifier may perform a short onsite calibration check when remote preparation is not accurate enough.

## Product Purpose

Ginder is a reusable Telegram festival companion built around one practical question: where was someone last seen on the festival's own illustrated map? It keeps people, tent locations, meeting points, the festival map, timetable, and reminders together in the Telegram context a festival group already uses.

Success means a group can choose a prepared festival, open its map, find people and saved places, coordinate a meetup, and check the timetable with minimal typing and no separate app installation. Ginder should remain useful under weak connectivity without behaving like a battery-hungry background tracker.

Space Safari 2026 is the first built-in festival instance and the verified reference implementation for the broader Ginder product.

## Positioning

Ginder turns a festival's own illustrated map into a battery-conscious shared field map. It translates GPS into the artwork people actually recognize, shows live position only while Ginder is actively open, then degrades honestly to “last seen” instead of pretending to provide continuous tracking.

## Operating Context

- Attendees primarily use Ginder on phones inside a Telegram group and its Mini App during a multi-day festival.
- The environment can be noisy, crowded, outdoors, battery-constrained, and poorly connected. Answers should be glanceable and essential map assets should remain useful under weak connectivity.
- Published festivals are prepared centrally. Attendees choose a festival; calibration never appears in the normal attendee flow.
- Operator setup covers the festival map, terrain bounds, GPS-to-image anchors, timetable, and publication state.
- The illustrated festival map is not assumed to be georeferenced. Calibration anchors map real GPS positions onto the supplied festival artwork.
- Remote calibration is allowed and expected. Anchors should use fixed, recognizable points spread across the site; Ginder scores the calibration and flags likely outliers.
- A short onsite verification can compare a fresh GPS fix with the same known point on the artwork. Onsite verification improves confidence but should not require every festival attendee to understand anchors.

## Capabilities and Constraints

- The attendee-facing directory contains only festivals explicitly published by Ginder and ready for use.
- Group tools cover the current and upcoming timetable, artist search, reminders, map access, group status, meeting points, and saved tent locations.
- The map supports a public room and private group rooms. Group rooms are isolated by opaque tokens derived from Telegram group context.
- Location sharing remains explicit opt-in and reciprocal for private group presence.
- The intended presence model is foreground-only: once a member starts sharing, Ginder may refresh their location while the Mini App is visible and active, but must not promise or simulate background tracking after it closes or is hidden.
- After foreground updates stop, the last successful position may remain visible as a clearly stale “last seen” marker for at most six hours. Explicit stop removes it immediately. Route history is never retained.
- Other clients receive projected map position plus freshness/accuracy metadata. Raw GPS is temporary and festival-scoped.
- Meeting points and tent locations remain visible independently of live presence.
- Calibration quality must not be inferred from anchor count alone. Spread and independent residual checks matter; suspicious anchors should be surfaced before publication.
- Space Safari timetable spelling, stage, and time come from the supplied official timetable images. Unknown secondary artist metadata remains explicitly unverified rather than guessed.
- Custom festival storage remains festival-scoped. Existing Space Safari production data retains its historical storage namespace for compatibility.
- The production stack is Next.js, React, TypeScript, Vercel Functions, Telegram Bot API and Mini Apps, Upstash Redis, Vercel Queues, MapLibre, Luxon, Zod, and Vitest.
- Ginder is currently an unofficial community product. Festival-provided map and timetable assets must not be presented as official or redistributed publicly without permission.

## Brand Commitments

- Product name: Ginder.
- Voice: direct, compact, practical Dutch suited to quick phone use; technical identifiers stay out of primary attendee-facing copy.
- Space Safari remains a named festival instance, not the umbrella product identity.
- The existing Ginder name, pin mark, app icons, and Telegram bot identity are durable assets.
- Battery restraint is part of the product promise: “live while open, last seen afterwards” is a feature, not a degraded Find My clone.

## Evidence on Hand

- `README.md` documents the working Space Safari instance, feature set, privacy model, deployment stack, and verified timetable totals.
- `src/data/schedule/`, `src/data/timetable.ts`, `src/data/verification.ts`, and `docs/timetable-verification.md` contain and validate the Space Safari 2026 schedule source of truth.
- `public/festival-map-original.png` is the current Space Safari map asset; `public/ginder-icon.svg` and the PNG icon set are the current Ginder identity assets.
- `src/lib/festival-bot-router.ts`, `src/lib/group-companion-router.ts`, and `src/lib/telegram-command-ui.ts` implement the owner and attendee Telegram workflows.
- `app/map/` implements the calibrated festival map and opt-in group presence; `docs/map-calibration.md` and `docs/mobile-map-ux.md` record its field and mobile constraints.
- `src/lib/calibration-quality.ts` scores map-anchor spread and independent cross-check errors so calibration confidence can be tested instead of guessed.
- Automated tests cover timetable integrity, festival isolation and recovery, onboarding privacy, reminders, map projection, location sharing, webhook security, calibration quality, and offline multi-festival behavior.
- No testimonials, adoption metrics, official festival partnerships, pricing, or public redistribution rights are established; future work must not fabricate them.

## Product Principles

1. Put the festival's own map first: people and places should make sense on the artwork attendees already recognize.
2. Keep attendee setup near zero: choose festival, join group, use map. Calibration is operator work.
3. Optimize for fast, glanceable festival use under imperfect attention, connectivity, and battery.
4. Make location sharing explicit, temporary, reciprocal, festival-scoped, and foreground-only.
5. Degrade honestly from live to “last seen”; never imply freshness that the client cannot guarantee.
6. Score calibration quality and verify uncertainty instead of trusting anchor count or filling gaps with guesses.
7. Keep the product narrow: finding people, tents, meeting points, and essential festival context outranks social-feed features.

## Accessibility & Inclusion

- Support Telegram content-safe-area insets and mobile browser safe areas so controls do not collide with platform chrome.
- Do not rely on color alone for live/offline, ownership, calibration confidence, or location state.
- Keep primary touch targets usable on a moving, one-handed phone and respect reduced-motion preferences.
