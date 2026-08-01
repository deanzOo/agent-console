"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current screen when any mission changes status.
 *
 * Server components hold the counts and the list, so refreshing the route is
 * what updates them — there is no client-side copy of a mission to patch.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/missions/stream");
    source.addEventListener("missions.changed", () => router.refresh());
    return () => source.close();
  }, [router]);

  return null;
}
