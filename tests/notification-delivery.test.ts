import { describe, expect, it, vi } from "vitest";
import { deliverPingNotification, type NotificationDeliveryDeps } from "@/src/lib/notification-delivery";
import { performerSets } from "@/src/data/timetable";
import type { ArtistPing } from "@/src/lib/pings";

function fixture() {
  const set = performerSets.find((item) => item.artist === "Sevenum Six")!;
  const ping: ArtistPing = { chatId: "123", artistSetId: set.id, notifyAt: "2026-09-05T23:45:00+02:00", createdAt: "2026-09-05T12:00:00+02:00" };
  let stored: ArtistPing | null = ping;
  let locked = false;
  const send = vi.fn(async () => undefined);
  const deps: NotificationDeliveryDeps = {
    getPing: async () => stored,
    setById: () => set,
    setLock: async () => { if (locked) return false; locked = true; return true; },
    clearLock: async () => { locked = false; },
    send,
    markSent: async (value) => { stored = { ...value, sentAt: "2026-09-05T23:45:01+02:00" }; },
  };
  return { set, deps, send, getStored: () => stored };
}

describe("notification delivery idempotency", () => {
  it("sends once and then skips a sent ping", async () => {
    const { set, deps, send, getStored } = fixture();
    expect(await deliverPingNotification("123", set.id, deps)).toBe("sent");
    expect(getStored()?.sentAt).toBeTruthy();
    expect(await deliverPingNotification("123", set.id, deps)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats a held lock as a duplicate delivery", async () => {
    const { set, deps, send } = fixture();
    await deps.setLock("already");
    deps.setLock = async () => false;
    expect(await deliverPingNotification("123", set.id, deps)).toBe("duplicate");
    expect(send).not.toHaveBeenCalled();
  });
});
