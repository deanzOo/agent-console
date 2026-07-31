import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@agent-console/core/env";
import { getDatabase } from "@agent-console/core/db";
import { SESSION_COOKIE, issueSession } from "@agent-console/core/auth";
import { setupAccessAllowed } from "@/lib/setup-access";
import { applySetupStep, setupState } from "@agent-console/core/setup";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// A fresh NextResponse per call: a shared one has a body that only streams once.
function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

const stepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("password"), password: z.string().min(1) }),
  z.object({ step: z.literal("github"), token: z.string().trim().min(1) }),
  z.object({ step: z.literal("asana"), token: z.string().trim().min(1) }),
  z.object({
    step: z.literal("telegram"),
    botToken: z.string().trim().min(1),
    chatId: z.string().trim().min(1),
  }),
  z.object({ step: z.literal("push"), subject: z.string().trim().min(1) }),
  z.object({ step: z.literal("finish") }),
]);

export async function GET(request: Request) {
  if (!(await setupAccessAllowed(request))) return unauthorized();

  const config = getConfig();
  return NextResponse.json(
    setupState(getDatabase(), {
      authMode: config.authMode,
      githubToken: config.githubToken,
      asanaToken: config.asanaToken,
    }),
  );
}

export async function POST(request: Request) {
  if (!(await setupAccessAllowed(request))) return unauthorized();

  const parsed = stepSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await applySetupStep(getDatabase(), parsed.data);
  } catch (error) {
    // Validation failures are the user's to fix, so return the reason verbatim.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  // Setting the password is what locks the wizard: from here on an anonymous
  // caller is refused, and every remaining step — including Finish — would 401.
  // Whoever just set it has proved they own the instance, so they get a session
  // and carry on rather than being shut out of the flow they are standing in.
  const response = NextResponse.json({ ok: true });
  if (parsed.data.step === "password") {
    const config = getConfig();
    if (config.sessionSecret) {
      response.cookies.set(
        SESSION_COOKIE,
        await issueSession(config.sessionSecret, "operator"),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: SESSION_MAX_AGE_SECONDS,
        },
      );
    }
  }
  return response;
}
