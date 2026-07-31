import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@agent-console/core/env";
import { SESSION_COOKIE, issueSession, verifyPassword } from "@agent-console/core/auth";
import { getDatabase } from "@agent-console/core/db";
import { getSetting } from "@agent-console/core/settings";

export const dynamic = "force-dynamic";

const loginSchema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const config = getConfig();
  if (config.authMode !== "password" || !config.sessionSecret) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const hash = getSetting(getDatabase(), "password_hash");
  // Same response either way: a distinct "no password set" would tell an
  // unauthenticated caller something about the deployment.
  if (!hash || !(await verifyPassword(hash, parsed.data.password))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await issueSession(config.sessionSecret, "operator");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
