import { NextResponse } from "next/server";
import { createWhatsAppGuestSession, readWebSession } from "@/src/lib/web-auth";
import { verifyWhatsAppRoomToken } from "@/src/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!verifyWhatsAppRoomToken(token)) {
    return new Response("Deze Space Safari WhatsApp-link is ongeldig of niet door deze server uitgegeven.", {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "referrer-policy": "no-referrer",
      },
    });
  }

  const destination = new URL(`/map?room=${encodeURIComponent(token)}&source=whatsapp`, request.url);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");

  const existing = readWebSession(request);
  const existingCanContinue = existing && (
    existing.provider !== "whatsapp" || existing.roomToken === token
  );

  if (!existingCanContinue) {
    const guest = createWhatsAppGuestSession(token);
    response.headers.append("set-cookie", guest.cookie);
  }

  return response;
}
