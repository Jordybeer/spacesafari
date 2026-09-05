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
