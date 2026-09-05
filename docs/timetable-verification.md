# Timetable verification

The three supplied official Space Safari timetable images for Friday 04.09.26, Saturday 05.09.26 and Sunday 06.09.26 are the schedule source of truth. Cross-midnight continuation rows were merged into one canonical set. Secondary research never changes official stage or time data.

## Verified counts

- Performer sets: **106**
- Schedule rows including breaks/soundchecks: **116**
- Friday: **21** performer sets
- Saturday: **44** performer sets
- Sunday: **41** performer sets
- Supernova: **28** performer sets
- Nebula: **33** performer sets
- Zodiac: **23** performer sets
- Galaxy: **22** performer sets

The complete canonical data is split into reviewable modules under `src/data/schedule/` and exported as one array from `src/data/timetable.ts`.

## 2026-09-05 source-image re-audit

All twelve day/stage modules were re-read against the three supplied timetable images after deployment. Friday, Saturday and Sunday stage boundaries, half-hour/quarter-hour transitions, breaks, soundchecks and the two midnight continuation panels were checked again. No timetable time/stage corrections were required by this pass.

Notable visually re-confirmed entries include Friday `Mixsaj` 17:30–18:30 and `Bukkha` 22:00–00:30; Saturday `Pala10 b2b Elisethere` 14:30–17:00 and `Felfel` 20:00–23:00; Sunday `Braincell` 18:30–20:00 after the explicit 30-minute Supernova gap, `Hagva` 18:00–19:00 and `Housepainters` 00:30–01:30 after the Galaxy soundcheck.

## Integrity rules

- `startsAt` and `endsAt` are ISO timestamps with the Europe/Brussels offset.
- Set activity uses `startsAt <= now < endsAt`.
- IDs are unique.
- Same-stage overlaps are rejected by automated tests.
- Cross-midnight rows use the correct next calendar date.
- Friday→Saturday and Saturday→Sunday continuation panels are de-duplicated.
- Official image spelling/stage/time outranks external artist listings.
- Unknown artist country remains visibly `Unverified` instead of being guessed.
- Artist genre/country metadata is provenance-separated from official timetable data.

Automated integrity tests also verify the total counts, per-day counts, per-stage counts, valid timestamps and boundaries.

## Remaining metadata work

This schedule audit verifies what is printed on the timetable. Artist genre/country fields that are not printed there are a separate research layer. Entries that still cannot be tied confidently to an official artist page, label, Bandcamp, Discogs or similarly credible source must remain `Unverified`; they are not promoted to verified metadata merely because they fit a stage genre.
