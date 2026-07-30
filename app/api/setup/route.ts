import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/config/env";
import { getDatabase } from "@/lib/db";
import { applySetupStep, setupState } from "@/lib/setup";

export const dynamic = "force-dynamic";

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

export function GET() {
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
