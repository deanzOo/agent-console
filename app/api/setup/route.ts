import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/config/env";
import { getDatabase } from "@/lib/db";
import { setupAccessAllowed } from "@/lib/setup-access";
import { applySetupStep, setupState } from "@/lib/setup";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({ ok: true });
}
