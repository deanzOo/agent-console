"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DEBOUNCE_MS = 250;

export interface Choice {
  readonly value: string;
  readonly label: string;
}

export interface Selector {
  readonly name: string;
  readonly label: string;
  readonly choices: readonly Choice[];
}

interface Props {
  readonly placeholder: string;
  readonly selectors: readonly Selector[];
}

// State lives in the query string, not in the component: a filtered list that
// resets on reload is worse than no filter, and it makes a view shareable.
export function FilterBar({ placeholder, selectors }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const currentQuery = params.get("q") ?? "";
  const [draft, setDraft] = useState(currentQuery);

  const apply = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === "") next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Typing should not put one navigation per keystroke into history, and the
  // list only has to keep up with the typist, not with every character.
  useEffect(() => {
    if (draft === currentQuery) return;
    const timer = setTimeout(() => apply({ q: draft }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, currentQuery, apply]);

  const active =
    currentQuery !== "" || selectors.some((s) => (params.get(s.name) ?? "") !== "");

  // Narrowing one filter can invalidate another — picking an organisation
  // leaves a repository from a different one selected, matching nothing. Each
  // selector clears the ones after it.
  function choose(index: number, value: string) {
    const changes: Record<string, string> = { [selectors[index]?.name ?? ""]: value };
    for (const later of selectors.slice(index + 1)) changes[later.name] = "";
    apply(changes);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        inputMode="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />

      {selectors.map((selector, index) => (
        <select
          key={selector.name}
          value={params.get(selector.name) ?? ""}
          onChange={(event) => choose(index, event.target.value)}
          aria-label={selector.label}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">{selector.label}</option>
          {selector.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ))}

      {active && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            apply({
              q: "",
              ...Object.fromEntries(selectors.map((s) => [s.name, ""])),
            });
          }}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700"
        >
          Clear
        </button>
      )}
    </div>
  );
}
