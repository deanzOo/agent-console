import { NextResponse } from "next/server";
import { getDatabase } from "@agent-console/core/db";
import { getMission } from "@agent-console/core/missions";
import { getSession } from "@agent-console/core/agents/manager";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!getMission(getDatabase(), id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session_not_running" }, { status: 409 });
  }

  await session.interrupt();
  return NextResponse.json({ ok: true });
}
