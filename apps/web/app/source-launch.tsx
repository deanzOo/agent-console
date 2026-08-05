import type { ReactNode } from "react";
import { isLiveStatus, type MissionStatus } from "@agent-console/core/missions";
import { MissionForSource } from "./mission-for-source";

interface ExistingMission {
  readonly id: string;
  readonly status: MissionStatus;
}

/**
 * What an issue or task row shows for launching a mission: the mission
 * already working it, if there is one, and the launch button — but only
 * while there isn't one already live. A finished or failed mission still
 * shows the button, since that work may need picking up again.
 */
export function SourceLaunch({
  mission,
  children,
}: {
  mission: ExistingMission | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {mission && <MissionForSource id={mission.id} status={mission.status} />}
      {(!mission || !isLiveStatus(mission.status)) && children}
    </div>
  );
}
