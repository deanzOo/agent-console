import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getMission } from "@/lib/missions";
import { getSession } from "@/lib/agents/manager";

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
