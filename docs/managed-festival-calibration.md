# Managed festival calibration

Ginder should treat map calibration as operator infrastructure, not attendee onboarding.

## Published festival lifecycle

1. **Prepare** — add festival metadata, map artwork, venue bounds and timetable.
2. **Remote calibrate** — place anchors using fixed points that can be matched confidently between real coordinates and the illustrated map.
3. **Quality gate** — require a useful spread and inspect independent residuals; do not approve a map merely because it has enough anchors.
4. **Onsite verify** — when possible, take a fresh GPS fix at one or more known points and compare the projected result with the same point on the artwork.
5. **Publish** — only ready festivals explicitly included in the curated catalog appear in the attendee selector.
6. **Revise** — a new festival-map artwork version starts a new calibration pass instead of silently reusing old anchors.

## Remote anchor rules

Prefer durable, easy-to-identify geometry:

- main entrance or gate
- fixed road or path intersections
- permanent buildings
- clearly fixed stage or structure positions when the coordinates are trustworthy
- opposite sides/corners of the site rather than several points on one path

Avoid anchors based on movable objects, approximate campsite areas, temporary bars, or points whose GPS coordinate came from visual guesswork.

Two anchors are only provisional. Three anchors can produce a usable transform when they span both dimensions. Four or more well-spread anchors permit an independent leave-one-out check and are preferred before publication.

## Quality score

`src/lib/calibration-quality.ts` combines three signals:

- anchor count
- horizontal and vertical spread across the artwork
- leave-one-out projection error when four or more anchors exist

The result is intentionally coarse:

- `insufficient` — cannot calibrate reliably
- `weak` — provisional, poorly spread, or contains a likely outlier
- `usable` — suitable for testing but worth another verification
- `good` — strong remote calibration; still benefits from an onsite check

A quality score is a gate and debugging aid, not a claim of meter-level GPS accuracy. Device GPS error, festival artwork distortion and temporary site changes remain independent sources of error.

## Onsite verification

An onsite check should not immediately mutate calibration.

1. Stand on a recognizable point.
2. Capture the current GPS fix and its horizontal accuracy.
3. Tap the exact same point on the festival artwork.
4. Project the GPS fix through the existing transform.
5. Compare projected versus tapped map position.
6. If the check is poor, inspect anchors first. Only promote the check to a new anchor deliberately.

Suggested normalized map-error interpretation:

- up to 3.5% of map dimensions: good
- 3.5–7%: check another point
- above 7%: recalibrate before publication

These thresholds are product heuristics, not physical-distance guarantees.

## Attendee contract

Normal attendees never see anchors, scores or calibration terminology. Their flow is:

**Choose festival → open group map → find people or saved places.**

If calibration confidence is not high enough, the operator should keep the festival unpublished or visibly mark the map as approximate rather than expose a setup workflow to attendees.

## Presence contract

The intended location model is deliberately battery-aware:

- sharing is explicit opt-in
- live refresh happens only while the Mini App is visible/active
- no background-tracking promise
- after updates stop, the last fix becomes `last seen`
- stale presence expires after at most six hours
- explicit stop removes presence immediately
- no route history

Implement the client migration atomically: remove the duration selector and long-lived `until I stop` mode at the same time the server enforces six-hour retention. Do not ship only one half of that change.
