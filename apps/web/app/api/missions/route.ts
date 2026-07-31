import { NextResponse } from "next/server";
import { getDatabase } from "@agent-console/core/db";
import { countAwaitingInput, listMissions } from "@agent-console/core/missions";
import { launchMissionSchema } from "@agent-console/core/protocol";
import { launchMission } from "@/lib/agentd";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDatabase();
  return NextResponse.json({
    missions: listMissions(db),
    awaitingInput: countAwaitingInput(db),
  });
}

export async function POST(request: Request) {
  const parsed = launchMissionSchema.safeParse(await request.json());
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
