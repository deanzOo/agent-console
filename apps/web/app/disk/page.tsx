import { getDiskUsage } from "@agent-console/core/disk-usage";
import { getDatabase } from "@agent-console/core/db";
import { getConfig } from "@agent-console/core/env";
import { MISSION_STATUS } from "@agent-console/core/schema";
import { formatBytes } from "@/lib/format-bytes";
import { ReclaimButton } from "./reclaim-button";

export const dynamic = "force-dynamic";

// A mission in one of these still owns its tree, so offering to delete it
// would only ever come back refused — same set discardWorkspace itself
// refuses against.
const LIVE_STATUSES = new Set<string>([
  MISSION_STATUS.STARTING,
  MISSION_STATUS.RUNNING,
  MISSION_STATUS.AWAITING_INPUT,
]);

export default async function DiskUsagePage() {
  const db = getDatabase();
  const config = getConfig();
  const report = await getDiskUsage(db, config.workspaceRoot);

  return (
    <main className="space-y-6">
      <h1 className="text-lg font-semibold">Disk usage</h1>

      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-neutral-500">Total</dt>
          <dd className="text-lg font-medium">{formatBytes(report.totalBytes)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">repos/ (shared clones)</dt>
          <dd className="text-lg font-medium">{formatBytes(report.reposBytes)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">wt/ (mission trees)</dt>
          <dd className="text-lg font-medium">{formatBytes(report.worktreesBytes)}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Mission worktrees</h2>
        {report.missions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No mission has a working tree on disk.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.missions.map((mission) => {
              const live = LIVE_STATUSES.has(mission.status);
              return (
                <li key={mission.missionId} className="flex items-center gap-2 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{mission.title}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {mission.status.replace("_", " ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatBytes(mission.bytes)}
                  </span>
                  {live ? (
                    <span className="shrink-0 text-xs text-neutral-500">in use</span>
                  ) : (
                    <ReclaimButton
                      url={`/api/missions/${mission.missionId}/workspace`}
                      confirmText="Delete this mission's working tree? Uncommitted work is lost."
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Trees with no mission</h2>
        {report.orphanTrees.length === 0 ? (
          <p className="text-sm text-neutral-500">None.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.orphanTrees.map((tree) => (
              <li key={tree.name} className="flex items-center gap-2 py-3">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {tree.name}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatBytes(tree.bytes)}
                </span>
                <ReclaimButton
                  url={`/api/disk-usage/orphans/${encodeURIComponent(tree.name)}`}
                  confirmText={`Delete ${tree.name}? Nothing tracks this tree, so this cannot be undone.`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.missingWorktrees.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Missions missing their recorded tree
          </h2>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.missingWorktrees.map((mission) => (
              <li key={mission.missionId} className="py-3 text-sm">
                <span className="font-medium">{mission.title}</span>{" "}
                <span className="text-xs text-neutral-500">
                  {mission.status.replace("_", " ")} · {mission.worktreePath} is gone
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
