import { NextResponse } from "next/server";
import { optionalEnv } from "@/src/lib/env";
import { timingSafeSecretEqual } from "@/src/lib/webhook-security";
import {
  extractWhatsAppGroupTextMessages,
  isWhatsAppMapCommand,
  sendWhatsAppGroupText,
  verifyWhatsAppWebhookSignature,
  whatsappMapLink,
} from "@/src/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const receivedToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = optionalEnv("WHATSAPP_VERIFY_TOKEN");

  if (
    mode === "subscribe" &&
    challenge &&
    receivedToken &&
    expectedToken &&
    timingSafeSecretEqual(receivedToken, expectedToken)
  ) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  return NextResponse.json({ error: "Invalid WhatsApp webhook verification" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWhatsAppWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid WhatsApp webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = extractWhatsAppGroupTextMessages(payload);
  const groupIds = Array.from(new Set(
    messages
      .filter((message) => isWhatsAppMapCommand(message.text))
      .map((message) => message.groupId),
  ));

  try {
    for (const groupId of groupIds) {
      const link = whatsappMapLink(groupId);
      await sendWhatsAppGroupText(
        groupId,
        [
          "🛸 Space Safari Live",
          "Open de privé-groepskaart:",
          link,
          "",
          "De link maakt een tijdelijke pseudonieme Space Safari-sessie. Je telefoonnummer wordt niet als login opgeslagen.",
        ].join("\n"),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp delivery failed";
    console.error("WhatsApp webhook handling failed", message);
    return NextResponse.json({ error: "WhatsApp delivery failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, handled: groupIds.length });
}
