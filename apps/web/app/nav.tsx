import Link from "next/link";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import { countIssues } from "@agent-console/core/issues";
import { countMissions } from "@agent-console/core/missions";
import { countTasks } from "@agent-console/core/tasks";
import { resolveCredentials } from "@agent-console/core/settings";
import { LiveRefresh } from "./live-refresh";
import { PushToggle } from "./push-toggle";
import { SyncButton } from "./sync-button";

// Zero is worth showing: an empty list and a broken integration look the same
// without it, and "Issues 0" says the sync ran and found nothing.
function Count({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[11px] font-normal text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {value}
    </span>
  );
}

export function Nav() {
  const db = getDatabase();
  const config = getConfig();
  const features = getFeatures(
    resolveCredentials(db, {
      githubToken: config.githubToken,
      asanaToken: config.asanaToken,
    }),
  );

  const showSync = features.github || features.asana;

  // Counts are what the screen would show, so a badge never disagrees with the
  // list under it: active missions, cached open issues, incomplete tasks.
  const missions = countMissions(db);
  const issues = features.github ? countIssues(db) : 0;
  const tasks = features.asana ? countTasks(db) : 0;

  return (
    <nav className="mb-6 flex items-center gap-4 border-b border-neutral-200 pb-3 text-sm dark:border-neutral-800">
      <LiveRefresh />
      <Link href="/" className="font-medium">
        Missions <Count value={missions} />
      </Link>
      {features.github && (
        <Link href="/issues">
          Issues <Count value={issues} />
        </Link>
      )}
      {features.asana && (
        <Link href="/tasks">
          Tasks <Count value={tasks} />
        </Link>
      )}
      {features.push && (
        <span className={showSync ? "" : "ml-auto"}>
          <PushToggle />
        </span>
      )}
      <Link href="/setup" className={showSync || features.push ? "" : "ml-auto"}>
        Setup
      </Link>
      {showSync && (
        <span className="ml-auto">
          <SyncButton />
        </span>
      )}
    </nav>
  );
}
