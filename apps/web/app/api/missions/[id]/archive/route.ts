import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@agent-console/core/db";
import {
  archiveMission,
  getMission,
  restoreMission,
} from "@agent-console/core/missions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ archived: z.boolean() });

// Archiving is a view decision, not a lifecycle one: it never touches the
// session, the transcript or the worktree, so it does not go through agentd.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getDatabase();

  if (!getMission(db, id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (parsed.data.archived) archiveMission(db, id);
  else restoreMission(db, id);

  return NextResponse.json({ ok: true });
}
