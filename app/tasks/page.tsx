import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getConfig } from "@/config/env";
import { getFeatures } from "@/config/features";
import { getDatabase } from "@/lib/db";
import { asanaCache } from "@/lib/schema";
import { resolveCredentials } from "@/lib/settings";
import { StartFromSource } from "../start-from-source";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  const db = getDatabase();
  const config = getConfig();
  const resolved = resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });

  if (!getFeatures(resolved).asana) notFound();

  const tasks = db
    .select()
    .from(asanaCache)
    .where(eq(asanaCache.completed, false))
    .orderBy(asc(asanaCache.dueOn))
    .limit(100)
    .all();

  return (
    <main className="space-y-4">
      <h1 className="text-lg font-semibold">Asana tasks</h1>

      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing cached yet. Run a sync from the dashboard.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {tasks.map((task) => (
            <li key={task.gid} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {task.project ?? "no project"}
                    {task.dueOn ? ` · due ${task.dueOn}` : ""}
                  </p>
                </div>
                <StartFromSource
                  source="asana"
                  sourceRef={task.gid}
                  title={task.name}
                  prompt={`Work on the Asana task "${task.name}".${
                    task.permalink ? `\n\n${task.permalink}` : ""
                  }\n\nAsk me which repository to work in if it is not obvious.`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
