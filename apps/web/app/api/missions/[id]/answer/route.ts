import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@agent-console/core/db";
import { answerPrompt as recordAnswer, getMission } from "@agent-console/core/missions";
import { answerPrompt } from "@/lib/agentd";

export const dynamic = "force-dynamic";

const answerSchema = z.discriminatedUnion("decision", [
  z.object({ promptId: z.string().min(1), decision: z.literal("allow") }),
  z.object({
    promptId: z.string().min(1),
    decision: z.literal("deny"),
    message: z.string().trim().min(1).default("Denied by the operator."),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getDatabase();

  if (!getMission(db, id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = answerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const outcome = await answerPrompt(id, parsed.data);
  if (!outcome.ok) {
    return outcome.reason === "unreachable"
      ? NextResponse.json({ error: "agentd_unreachable" }, { status: 503 })
      : NextResponse.json(outcome.body ?? { error: "failed" }, {
          status: outcome.status,
        });
  }

  // Marked answered only once the session has accepted it, so a lost reply
  // cannot leave a prompt that looks handled and an agent still waiting.
  recordAnswer(db, parsed.data.promptId);
  return NextResponse.json({ ok: true });
}
