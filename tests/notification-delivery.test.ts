import { describe, expect, it, vi } from "vitest";
import { deliverPingNotification, deliveryLockKey, type NotificationDeliveryDeps } from "@/src/lib/notification-delivery";
import { performerSets } from "@/src/data/timetable";
import type { ArtistPing } from "@/src/lib/pings";
import type { FestivalScheduleEntry } from "@/src/lib/festival-schedule";

function fixture() {
  const set = performerSets.find((item) => item.artist === "Sevenum Six")!;
  const ping: ArtistPing = { chatId: "123", artistSetId: set.id, notifyAt: "2026-09-05T23:45:00+02:00", createdAt: "2026-09-05T12:00:00+02:00" };
  let stored: ArtistPing | null = ping;
  let locked = false;
  const send = vi.fn(async () => undefined);
  const deps: NotificationDeliveryDeps = {
    getPing: async () => stored,
    setById: () => set,
    festivalTimezone: async () => "Europe/Brussels",
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

  it("keeps a custom festival id through lookup, lock and formatting", async () => {
    const festivalId = "horst-2027-abcd";
    const set: FestivalScheduleEntry = {
      id: "night-set",
      artist: "Beta",
      stage: "Club",
      startsAt: "2027-07-10T23:30:00+02:00",
      endsAt: "2027-07-11T01:00:00+02:00",
      kind: "set",
      live: false,
      note: null,
    };
    const ping: ArtistPing = {
      chatId: "456",
      artistSetId: set.id,
      festivalId,
      notifyAt: "2027-07-10T23:15:00+02:00",
      createdAt: "2027-07-10T12:00:00+02:00",
    };
    const getPing = vi.fn(async () => ping);
    const setById = vi.fn(async () => set);
    const setLock = vi.fn(async () => true);
    const send = vi.fn(async () => undefined);
    const deps: NotificationDeliveryDeps = {
      getPing,
      setById,
      festivalTimezone: async () => "Europe/Brussels",
      setLock,
      clearLock: async () => undefined,
      send,
      markSent: async () => undefined,
    };

    expect(await deliverPingNotification("456", set.id, festivalId, deps)).toBe("sent");
    expect(getPing).toHaveBeenCalledWith("456", set.id, festivalId);
    expect(setById).toHaveBeenCalledWith(set.id, festivalId);
    expect(setLock).toHaveBeenCalledWith(deliveryLockKey("456", set.id, festivalId));
    expect(send.mock.calls[0]?.[1]).toContain("23:30–01:00");
  });
});
