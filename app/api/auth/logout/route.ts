import { NextResponse } from "next/server";
import { clearWebSessionCookie } from "@/src/lib/web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.headers.append("set-cookie", clearWebSessionCookie());
  return response;
}
