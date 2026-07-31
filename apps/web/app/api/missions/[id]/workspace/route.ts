import { NextResponse } from "next/server";
import { getConfig } from "@agent-console/core/env";
import { getDatabase } from "@agent-console/core/db";
import { getMission } from "@agent-console/core/missions";
import { discardWorkspace } from "@agent-console/core/workspace";

export const dynamic = "force-dynamic";

// Discarding touches only the filesystem, and refuses while the mission is
// live, so it does not need the session host.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getDatabase();
  const mission = getMission(db, id);

  if (!mission) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const config = getConfig();
  const result = await discardWorkspace(
    db,
    { workspaceRoot: config.workspaceRoot, token: config.githubToken },
    mission,
  );

  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json(
    { error: result.reason },
    { status: result.reason === "still_running" ? 409 : 400 },
  );
}
