import Link from "next/link";
import { StatusBadge } from "./status-badge";

/** Points an issue or task row at the mission already working it. */
export function MissionForSource({ id, status }: { id: string; status: string }) {
  return (
    <Link
      href={`/missions/${id}`}
      className="flex shrink-0 items-center gap-2 text-xs text-neutral-500 hover:underline"
    >
      Mission
      <StatusBadge status={status} />
    </Link>
  );
}
