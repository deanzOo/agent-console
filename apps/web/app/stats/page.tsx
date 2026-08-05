import { getDatabase } from "@agent-console/core/db";
import { getStats } from "@agent-console/core/stats";
import { formatDuration } from "@/lib/format-duration";
import { formatUsd } from "@/lib/format-usd";

export const dynamic = "force-dynamic";

const NO_REPO_LABEL = "(no repo)";

export default async function StatsPage() {
  const db = getDatabase();
  const report = getStats(db);

  return (
    <main className="space-y-6">
      <h1 className="text-lg font-semibold">Stats</h1>

      <dl className="text-sm">
        <dt className="text-neutral-500">Total spend</dt>
        <dd className="text-lg font-medium">{formatUsd(report.totalCostUsd)}</dd>
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Spend by mission</h2>
        {report.costByMission.length === 0 ? (
          <p className="text-sm text-neutral-500">No billed mission yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.costByMission.map((mission) => (
              <li key={mission.missionId} className="flex items-center gap-2 py-3">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {mission.title}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatUsd(mission.usd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Spend by repository</h2>
        {report.costByRepo.length === 0 ? (
          <p className="text-sm text-neutral-500">No billed mission yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.costByRepo.map((repo) => (
              <li
                key={repo.repo ?? NO_REPO_LABEL}
                className="flex items-center gap-2 py-3"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {repo.repo ?? NO_REPO_LABEL}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatUsd(repo.usd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Spend by day</h2>
        {report.costByDay.length === 0 ? (
          <p className="text-sm text-neutral-500">No billed mission yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.costByDay.map((day) => (
              <li key={day.day} className="flex items-center gap-2 py-3">
                <span className="min-w-0 flex-1 font-mono text-xs">{day.day}</span>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatUsd(day.usd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">How long agents waited on you</h2>
        <p className="text-xs text-neutral-500">
          Time between a tool asking for approval and it being answered, longest first.
        </p>
        {report.waits.length === 0 ? (
          <p className="text-sm text-neutral-500">No prompt has been answered yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {report.waits.map((wait, index) => (
              // Mission + tool is not unique on its own: the same tool can wait
              // more than once in a mission, so the index breaks the tie.
              <li
                key={`${wait.missionId}-${wait.toolName}-${index}`}
                className="flex items-center gap-2 py-3"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{wait.title}</span>{" "}
                  <span className="text-xs text-neutral-500">{wait.toolName}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatDuration(wait.seconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
