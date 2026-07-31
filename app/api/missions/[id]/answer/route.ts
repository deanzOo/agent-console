import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@agent-console/core/db";
import { answerPrompt, getMission } from "@agent-console/core/missions";
import { getSession } from "@agent-console/core/agents/manager";

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

  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session_not_running" }, { status: 409 });
  }

  const handled = session.answer(
    parsed.data.promptId,
    parsed.data.decision === "allow"
      ? { behavior: "allow" }
      : { behavior: "deny", message: parsed.data.message },
  );

  if (!handled) {
    return NextResponse.json({ error: "prompt_not_pending" }, { status: 409 });
  }

  answerPrompt(db, parsed.data.promptId);
  return NextResponse.json({ ok: true });
}
