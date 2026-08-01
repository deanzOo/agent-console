import { NextResponse } from "next/server";
import { getDatabase } from "@agent-console/core/db";
import { getMission } from "@agent-console/core/missions";
import { setModeSchema } from "@agent-console/core/protocol";
import { setMissionMode } from "@/lib/agentd";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!getMission(getDatabase(), id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = setModeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const outcome = await setMissionMode(id, parsed.data.mode);
  if (outcome.ok) return NextResponse.json({ ok: true });

  return outcome.reason === "unreachable"
    ? NextResponse.json({ error: "agentd_unreachable" }, { status: 503 })
    : NextResponse.json(outcome.body ?? { error: "failed" }, {
        status: outcome.status,
      });
}
