import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatCurrent } from "@/src/lib/bot-router";

describe("compact now board", () => {
  it("groups each stage into current and next rows", () => {
    const now = DateTime.fromISO("2026-09-05T23:43:00+02:00", { setZone: true });

    expect(formatCurrent(now)).toBe(
      [
        "🎧 NU",
        "",
        "🩷 Supernova",
        "Nu: Dju-Yo · 22:30–00:00",
        "Daarna: CYK · 00:00 · live",
        "",
        "🟣 Nebula",
        "Nu: Collision · 22:30–00:00",
        "Daarna: Sevenum Six · 00:00",
        "",
        "🩵 Zodiac",
        "Nu: Aa Sudd & Daniel[i] · 23:00–01:00 · live",
        "Daarna: Formant Value · 01:00 · live",
        "",
        "🧡 Galaxy",
        "Nu: Tweeden Asem · 22:00–00:00",
        "Daarna: Housepainters · 00:30 · live",
      ].join("\n"),
    );
  });
});
