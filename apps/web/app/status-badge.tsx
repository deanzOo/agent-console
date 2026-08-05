const STATUS_STYLES: Record<string, string> = {
  awaiting_input: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  running: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  starting: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  done: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  stopped: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-1 text-xs ${STATUS_STYLES[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
