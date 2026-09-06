# Map location sharing presets

The Mini App exposes 15m, 30m, 1h, 2h and festival-long (∞) sharing presets. The selected lifetime is enforced in Redis and the live mode refreshes the coordinate every 25 seconds while the Mini App remains active. The festival-long preset is bounded to seven days as a stale-presence safety cap and can always be stopped manually.
