# Live map calibration

The Space Safari terrain image is stylised, so it cannot be accurately positioned from one GPS coordinate alone. The Mini App stores calibration anchors that bind a real GPS point to a normalized point on the illustration.

Each anchor contains:

```ts
{
  name: string;
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
  mapX: number; // 0..1 from left to right
  mapY: number; // 0..1 from top to bottom
}
```

## Field workflow

1. Add your Telegram numeric user ID to `MAP_ADMIN_TELEGRAM_IDS`.
2. Open the bot and run `/mapadmin`.
3. Physically stand at a recognizable location.
4. Press **Neem huidige GPS** and wait for the best available accuracy.
5. Tap the identical spot on the festival illustration.
6. Name it, e.g. `Entrance`, `Galaxy`, `Nebula`, `Zodiac`, `Supernova`, `Camping 2`, `Onze tent`.
7. Save the anchor.
8. Walk to another well-separated location and repeat.

Two anchors enable a similarity transform. Three or more nearby non-collinear anchors enable local affine projection, which is better for a distorted illustrated map.

Spread anchors across the actual area rather than recording several almost on top of each other. Prefer fixes with a low horizontal-accuracy value. GPS under trees or between structures can drift, so a later cleaner fix can replace a bad anchor.

Raw attendee locations are never returned to other map clients. Other users receive only projected `mapX/mapY`, Telegram display information, horizontal accuracy and `updatedAt`. Presence expires after 15 minutes.
