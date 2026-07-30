import { notFound } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { getMission, listEvents, openPrompts } from "@/lib/missions";
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
      }}
      initialEvents={listEvents(db, id, 0)}
      initialPrompts={openPrompts(db, id)}
    />
  );
}
