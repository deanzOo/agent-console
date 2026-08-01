"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface Tab {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

// A tab rather than a value in the filter dropdown: finished and archived work
// is a different thing to look at, not a narrowing of what you are looking at.
export function MissionTabs({ tabs }: { tabs: readonly Tab[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("view") ?? "";

  function show(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "") next.delete("view");
    else next.set("view", value);
    // Switching what you are looking at resets the page and any status filter:
    // "failed" means nothing in a list that is only archived work.
    next.delete("from");
    next.delete("status");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  return (
    <div className="flex gap-1 border-b border-neutral-200 text-sm dark:border-neutral-800">
      {tabs.map((tab) => {
        const active = current === tab.value;
        return (
          <button
            key={tab.value || "active"}
            type="button"
            onClick={() => show(tab.value)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 ${
              active
                ? "border-neutral-900 font-medium dark:border-white"
                : "border-transparent text-neutral-500"
            }`}
          >
            {tab.label} <span className="text-xs text-neutral-500">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
