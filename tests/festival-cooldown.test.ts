import { describe, expect, it } from "vitest";
import { cooldownText } from "@/src/lib/festival-bot-router";

describe("festival creation cooldown copy", () => {
  it("keeps days and remaining hours instead of rounding up the day count", () => {
    expect(cooldownText((3 * 24 + 7) * 3600)).toBe("3 dagen en 7 uur");
  });

  it("rounds partial hours up and keeps exact whole days compact", () => {
    expect(cooldownText(30 * 60)).toBe("1 uur");
    expect(cooldownText(24 * 3600)).toBe("1 dag");
    expect(cooldownText(25 * 3600)).toBe("1 dag en 1 uur");
  });
});
