import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@agent-console/core/db";
import { getMission } from "@agent-console/core/missions";
import { sayToMission } from "@/lib/agentd";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().trim().min(1) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!getMission(getDatabase(), id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const outcome = await sayToMission(id, parsed.data.text);
  if (outcome.ok) return NextResponse.json({ ok: true });

  return outcome.reason === "unreachable"
    ? NextResponse.json({ error: "agentd_unreachable" }, { status: 503 })
    : NextResponse.json(outcome.body ?? { error: "failed" }, {
        status: outcome.status,
      });
}
