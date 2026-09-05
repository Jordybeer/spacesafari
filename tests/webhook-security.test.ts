import { describe, expect, it } from "vitest";
import { timingSafeSecretEqual } from "@/src/lib/webhook-security";

describe("webhook secret validation", () => {
  it("accepts exact secret only", () => {
    expect(timingSafeSecretEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeSecretEqual("abc124", "abc123")).toBe(false);
    expect(timingSafeSecretEqual("abc", "abc123")).toBe(false);
  });
});
