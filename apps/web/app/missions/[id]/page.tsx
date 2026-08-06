import { notFound } from "next/navigation";
import { getDatabase } from "@agent-console/core/db";
import { getMission, listEvents, openPrompts } from "@agent-console/core/missions";
import { sourceLinkFor } from "@agent-console/core/source-link";
import { MissionLive } from "./mission-live";

export const dynamic = "force-dynamic";

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDatabase();
  const mission = getMission(db, id);
  if (!mission) notFound();

  return (
    <MissionLive
      mission={{
        id: mission.id,
        title: mission.title,
        status: mission.status,
        repo: mission.repo,
        branch: mission.branch,
        worktreePath: mission.worktreePath,
        mode: mission.mode,
      }}
      source={sourceLinkFor(db, mission) ?? null}
      initialEvents={listEvents(db, id, 0)}
      initialPrompts={openPrompts(db, id)}
    />
  );
}
