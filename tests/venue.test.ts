import { describe, expect, it } from "vitest";
import { isNearVenue, VENUE_CENTER } from "@/src/lib/venue";

describe("venue location guard", () => {
  it("accepts Space Safari site coordinates", () => expect(isNearVenue(VENUE_CENTER)).toBe(true));
  it("rejects remote coordinates", () => expect(isNearVenue({ latitude: 51.2194, longitude: 4.4025 })).toBe(false));
});
