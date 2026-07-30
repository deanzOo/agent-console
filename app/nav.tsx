import Link from "next/link";
import { getConfig } from "@/config/env";
import { getFeatures } from "@/config/features";
import { getDatabase } from "@/lib/db";
import { resolveCredentials } from "@/lib/settings";
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
      {showSync && (
        <span className="ml-auto">
          <SyncButton />
        </span>
      )}
    </nav>
  );
}
