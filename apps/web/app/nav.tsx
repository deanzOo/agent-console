import Link from "next/link";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import { resolveCredentials } from "@agent-console/core/settings";
import { PushToggle } from "./push-toggle";
import { SyncButton } from "./sync-button";

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

  return (
    <nav className="mb-6 flex items-center gap-4 border-b border-neutral-200 pb-3 text-sm dark:border-neutral-800">
      <Link href="/" className="font-medium">
        Missions
      </Link>
      {features.github && <Link href="/issues">Issues</Link>}
      {features.asana && <Link href="/tasks">Tasks</Link>}
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
