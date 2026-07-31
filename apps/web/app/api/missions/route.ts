import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@agent-console/core/db";
import { countAwaitingInput, listMissions } from "@agent-console/core/missions";
import { launchMission } from "@/lib/agentd";

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

  const outcome = await launchMission(parsed.data);
  if (!outcome.ok) {
    return outcome.reason === "unreachable"
      ? NextResponse.json({ error: "agentd_unreachable" }, { status: 503 })
      : NextResponse.json(outcome.body ?? { error: "failed" }, {
          status: outcome.status,
        });
  }
  return NextResponse.json(outcome.value, { status: 201 });
}
