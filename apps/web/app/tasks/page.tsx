import { notFound } from "next/navigation";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import { listTaskPage, listTaskProjects } from "@agent-console/core/tasks";
import { resolveCredentials } from "@agent-console/core/settings";
import { FilterBar } from "../filter-bar";
import { Pager } from "../pager";
import { StartFromSource } from "../start-from-source";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; view?: string; from?: string }>;
}) {
  const { q, project, view, from } = await searchParams;
  const offset = Math.max(0, Number.parseInt(from ?? "", 10) || 0);
  const completed = view === "completed";
  const db = getDatabase();
  const config = getConfig();
  const resolved = resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });

  if (!getFeatures(resolved).asana) notFound();

  const { tasks, total } = listTaskPage(db, {
    project,
    query: q,
    completed,
    limit: PAGE_SIZE,
    offset,
  });
  const projects = listTaskProjects(db);

  return (
    <main className="space-y-4">
      <h1 className="text-lg font-semibold">Asana tasks</h1>

      <FilterBar
        placeholder="Search tasks"
        selectors={[
          {
            name: "project",
            label: "All projects",
            choices: projects.map((name) => ({ value: name, label: name })),
          },
          {
            name: "view",
            label: "Open",
            choices: [{ value: "completed", label: "Completed" }],
          },
        ]}
      />

      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {q || project || completed
            ? "No task matches that filter."
            : "Nothing cached yet. Run a sync from the dashboard."}
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

      {tasks.length > 0 && (
        <Pager
          total={total}
          shown={tasks.length}
          offset={offset}
          pageSize={PAGE_SIZE}
        />
      )}
    </main>
  );
}
