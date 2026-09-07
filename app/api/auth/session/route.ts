import { NextResponse } from "next/server";
import { readWebSession, telegramLoginConfigured } from "@/src/lib/web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = readWebSession(request);
  return NextResponse.json({
    authenticated: Boolean(session),
    loginConfigured: telegramLoginConfigured(),
    user: session ? {
      id: session.user.id,
      firstName: session.user.first_name,
      username: session.user.username ?? null,
      photoUrl: session.user.photo_url ?? null,
    } : null,
  }, { headers: { "cache-control": "no-store" } });
}
