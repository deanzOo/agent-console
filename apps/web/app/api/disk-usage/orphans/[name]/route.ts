import { NextResponse } from "next/server";
import { getConfig } from "@agent-console/core/env";
import { discardOrphanTree } from "@agent-console/core/disk-usage";

export const dynamic = "force-dynamic";

// An orphan tree has no mission row to check status against, which is why it
// is a separate route from `/api/missions/[id]/workspace` rather than a case
// inside it.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const config = getConfig();
  const result = await discardOrphanTree(config.workspaceRoot, name);

  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.reason }, { status: 400 });
}
