import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractWhatsAppGroupTextMessages,
  isWhatsAppMapCommand,
  verifyWhatsAppRoomToken,
  verifyWhatsAppWebhookSignature,
  whatsappRoomToken,
} from "@/src/lib/whatsapp";

describe("WhatsApp room bridge", () => {
  const previousMapSecret = process.env.MAP_ROOM_SECRET;

  beforeEach(() => {
    process.env.MAP_ROOM_SECRET = "test-map-room-secret-with-enough-entropy";
  });

  afterEach(() => {
    if (previousMapSecret === undefined) delete process.env.MAP_ROOM_SECRET;
    else process.env.MAP_ROOM_SECRET = previousMapSecret;
  });

  it("creates deterministic opaque self-verifying room tokens", () => {
    const token = whatsappRoomToken("120363012345678901@g.us");
    expect(token).toHaveLength(32);
    expect(token).not.toContain("120363");
    expect(whatsappRoomToken("120363012345678901@g.us")).toBe(token);
    expect(whatsappRoomToken("other-group")).not.toBe(token);
    expect(verifyWhatsAppRoomToken(token)).toBe(true);

    const tampered = `${token[0] === "A" ? "B" : "A"}${token.slice(1)}`;
    expect(verifyWhatsAppRoomToken(tampered)).toBe(false);
  });

  it("verifies Meta webhook signatures against the raw body", () => {
    const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const secret = "meta-app-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    expect(verifyWhatsAppWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(`${rawBody} `, signature, secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(rawBody, "sha256=deadbeef", secret)).toBe(false);
  });

  it("extracts group text messages and ignores non-group messages", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            messages: [
              {
                from: "32470000000",
                id: "wamid.group",
                group_id: "group-123",
                type: "text",
                text: { body: "/map" },
              },
              {
                from: "32470000001",
                id: "wamid.direct",
                type: "text",
                text: { body: "/map" },
              },
            ],
          },
        }],
      }],
    };

    expect(extractWhatsAppGroupTextMessages(payload)).toEqual([{
      groupId: "group-123",
      messageId: "wamid.group",
      from: "32470000000",
      text: "/map",
    }]);
  });

  it("accepts only explicit map commands", () => {
    expect(isWhatsAppMapCommand("/map")).toBe(true);
    expect(isWhatsAppMapCommand(" KAART ")).toBe(true);
    expect(isWhatsAppMapCommand("waar is de map?")).toBe(false);
  });
});
