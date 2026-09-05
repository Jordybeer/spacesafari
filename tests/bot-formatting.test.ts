import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { currentSets, nextOnStage, formatClock } from "@/src/lib/festival-time";
import { STAGES } from "@/src/data/stages";

function blockAt(iso: string) {
  const now = DateTime.fromISO(iso, { setZone: true });
  return currentSets(now).map((set) => {
    const stage = STAGES[set.stage];
    const next = nextOnStage(set);
    const genre = set.genre ?? stage.genre;
    const flag = set.countryFlag ? ` ${set.countryFlag}` : "";
    return [
      `${stage.emoji} ${set.stage} · ${set.artist}${set.live ? " · live" : ""}`,
      `   ${formatClock(set.startsAt)}–${formatClock(set.endsAt)} · ${genre}${flag} · ${next ? `↳ ${formatClock(next.startsAt)} ${next.artist}${next.live ? " · live" : ""}` : "↳ einde"}`,
    ].join("\n");
  });
}

describe("compact now board", () => {
  it("keeps each current stage to two lines without verbose country labels", () => {
    const blocks = blockAt("2026-09-05T22:14:00+02:00");
    expect(blocks).toHaveLength(4);
    expect(blocks.every((block) => block.split("\n").length === 2)).toBe(true);
    expect(blocks.join("\n")).not.toContain("Unverified");
    expect(blocks.join("\n")).toContain("↳");
  });
});
