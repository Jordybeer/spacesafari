import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { deliverPingNotification } from "@/src/lib/notification-delivery";
import { requireEnv } from "@/src/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeliveryBody = { chatId: string; artistSetId: string };

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") ?? "";
  const receiver = new Receiver({
    currentSigningKey: requireEnv("QSTASH_CURRENT_SIGNING_KEY"),
    nextSigningKey: requireEnv("QSTASH_NEXT_SIGNING_KEY"),
  });

  const valid = await receiver.verify({
    signature,
    body: rawBody,
    url: `${requireEnv("APP_URL").replace(/\/$/, "")}/api/notifications/deliver`,
  }).catch(() => false);
  if (!valid) return NextResponse.json({ ok: false }, { status: 401 });

  let body: DeliveryBody;
  try {
    body = JSON.parse(rawBody) as DeliveryBody;
    if (!body.chatId || !body.artistSetId) throw new Error("missing fields");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const result = await deliverPingNotification(body.chatId, body.artistSetId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Ping delivery failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
