import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatCurrent } from "@/src/lib/bot-router";

describe("compact now board", () => {
  it("renders each stage as a scan-friendly current-to-next tree", () => {
    const now = DateTime.fromISO("2026-09-05T23:43:00+02:00", { setZone: true });

    expect(formatCurrent(now)).toBe(
      [
        "🎧 NU",
        "",
        "🩷 Supernova",
        "├ 22:30–00:00  Dju-Yo",
        "└ 00:00 → CYK · live",
        "",
        "🟣 Nebula",
        "├ 22:30–00:00  Collision",
        "└ 00:00 → Sevenum Six",
        "",
        "🩵 Zodiac",
        "├ 23:00–01:00  Aa Sudd & Daniel[i] · live",
        "└ 01:00 → Formant Value · live",
        "",
        "🧡 Galaxy",
        "├ 22:00–00:00  Tweeden Asem",
        "└ 00:30 → Housepainters · live",
      ].join("\n"),
    );
  });
});
