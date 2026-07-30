import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { countAwaitingInput, listMissions } from "@/lib/missions";
import { launchMission } from "@/lib/agents/manager";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1),
  source: z.enum(["free", "github", "asana"]).default("free"),
  sourceRef: z.string().trim().min(1).optional(),
  repo: z
    .string()
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "expected owner/repo")
    .optional(),
  base: z.string().trim().min(1).optional(),
});

export function GET() {
  const db = getDatabase();
  return NextResponse.json({
    missions: listMissions(db),
    awaitingInput: countAwaitingInput(db),
  });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const id = await launchMission(parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
