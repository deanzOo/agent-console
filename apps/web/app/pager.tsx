"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  readonly total: number;
  readonly shown: number;
  readonly offset: number;
  readonly pageSize: number;
}

// Paging rather than infinite scroll: the transcript already asks a lot of the
// scroll on a phone, and a list you can leave and come back to beats one that
// only exists as far as you have scrolled.
export function Pager({ total, shown, offset, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(nextOffset: number) {
    const next = new URLSearchParams(params.toString());
    if (nextOffset <= 0) next.delete("from");
    else next.set("from", String(nextOffset));
    router.replace(`${pathname}?${next.toString()}`, { scroll: true });
  }

  const first = total === 0 ? 0 : offset + 1;
  const last = offset + shown;
  const hasPrevious = offset > 0;
  const hasNext = last < total;

  if (!hasPrevious && !hasNext) {
    return <p className="text-xs text-neutral-500">{total} total</p>;
  }

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      {/* Saying "100 of 247" is the whole point: a list cut at the limit with
          nothing to show for it reads as the complete set. */}
      <span className="text-neutral-500">
        {first}–{last} of {total}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => go(offset - pageSize)}
          disabled={!hasPrevious}
          className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => go(offset + pageSize)}
          disabled={!hasNext}
          className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
        >
          Next
        </button>
      </span>
    </div>
  );
}
