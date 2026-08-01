import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@agent-console/core/db";
import {
  countAwaitingInput,
  countMissions,
  listMissions,
} from "@agent-console/core/missions";
import { MISSION_STATUSES } from "@agent-console/core/schema";
import { isSetupComplete } from "@agent-console/core/settings";
import { ArchiveButton } from "./archive-button";
import { FilterBar } from "./filter-bar";
import { MissionTabs } from "./mission-tabs";
import { NewMissionForm } from "./new-mission-form";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  awaiting_input: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  running: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  starting: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  done: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  stopped: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
};

function asStatus(value: string | undefined) {
  return MISSION_STATUSES.find((status) => status === value);
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; view?: string }>;
}) {
  const { q, status, view } = await searchParams;
  const archived = view === "archived";
  const finished = view === "finished";
  const db = getDatabase();
  // First run lands on the wizard. Every other page is reached from here, so
  // one check covers the app without risking a redirect loop on /setup itself.
  if (!isSetupComplete(db)) redirect("/setup");

  const missions = listMissions(db, {
    query: q,
    status: finished ? undefined : asStatus(status),
    archived,
    finished,
  });

  const tabs = [
    { value: "", label: "Active", count: countMissions(db, { active: true }) },
    {
      value: "finished",
      label: "Finished",
      count: countMissions(db, { finished: true }),
    },
    {
      value: "archived",
      label: "Archived",
      count: countMissions(db, { archived: true }),
    },
  ];
  const waiting = countAwaitingInput(db);

  return (
    <main className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Agent Console</h1>
        {waiting > 0 && (
          <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-medium text-white">
            {waiting} waiting on you
          </span>
        )}
      </header>

      <NewMissionForm />

      <MissionTabs tabs={tabs} />

      <FilterBar
        placeholder="Search missions"
        selectors={[
          {
            name: "status",
            label: "Any status",
            choices: MISSION_STATUSES.map((value) => ({
              value,
              label: value.replace("_", " "),
            })),
          },
        ]}
      />

      {missions.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {q || status
            ? "No mission matches that filter."
            : archived
              ? "Nothing archived."
              : finished
                ? "Nothing finished yet."
                : "No missions running."}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {missions.map((mission) => (
            <li key={mission.id} className="flex items-center gap-2 py-3">
              <Link
                href={`/missions/${mission.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{mission.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {mission.repo ?? "no repository"}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs ${
                    STATUS_STYLES[mission.status] ?? ""
                  }`}
                >
                  {mission.status.replace("_", " ")}
                </span>
              </Link>
              <ArchiveButton missionId={mission.id} archived={archived} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
