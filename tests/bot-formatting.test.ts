import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatCurrent } from "@/src/lib/bot-router";

describe("compact now board", () => {
  it("makes current and next sets unambiguous at a glance", () => {
    const now = DateTime.fromISO("2026-09-05T23:43:00+02:00", { setZone: true });

    expect(formatCurrent(now)).toBe(
      [
        "🎧 NU",
        "",
        "🩷 Supernova · Dju-Yo",
        "Nu: 22:30–00:00",
        "Volgende: 00:00 · CYK · live",
        "",
        "🟣 Nebula · Collision",
        "Nu: 22:30–00:00",
        "Volgende: 00:00 · Sevenum Six",
        "",
        "🩵 Zodiac · Aa Sudd & Daniel[i] · live",
        "Nu: 23:00–01:00",
        "Volgende: 01:00 · Formant Value · live",
        "",
        "🧡 Galaxy · Tweeden Asem",
        "Nu: 22:00–00:00",
        "Volgende: 00:30 · Housepainters · live",
      ].join("\n"),
    );
  });
});
