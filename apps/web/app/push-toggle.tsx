"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { decodeVapidKey } from "@/lib/push-key";

const publicKeySchema = z.object({ publicKey: z.string().min(1) });

type State = "checking" | "unsupported" | "off" | "on" | "blocked" | "failed";

const LABEL: Record<State, string> = {
  checking: "…",
  unsupported: "Notifications unavailable",
  off: "Enable notifications",
  on: "Notifications on",
  blocked: "Notifications blocked",
  failed: "Enable notifications",
};

// iOS only exposes push to an installed app, and says nothing useful when it
// is missing — the button would simply do nothing on a phone, which is the
// device this product exists for.
function needsInstallFirst(): boolean {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  return iOS && !installed;
}

// `window` is the only reliable "am I in a browser" check here: Node defines a
// global `navigator` (for userAgent) but no `window`, so guarding on navigator
// passes on the server and then throws the moment window is touched.
function inBrowser(): boolean {
  return typeof window !== "undefined";
}

function supported(): boolean {
  return inBrowser() && "serviceWorker" in navigator && "PushManager" in window;
}

export function PushToggle() {
  // Both are knowable at first render on the client. Deriving them here rather
  // than setting them from an effect avoids a second render, and the lint rule
  // that forbids it is right: an effect is for talking to the outside, not for
  // computing what render already knows.
  const [state, setState] = useState<State>(() =>
    !inBrowser() || supported() ? "checking" : "unsupported",
  );
  const [hint, setHint] = useState<string>(() =>
    inBrowser() && !supported() && needsInstallFirst()
      ? "Add to Home Screen first, then enable."
      : "",
  );

  useEffect(() => {
    if (!supported()) return;

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (Notification.permission === "denied") return setState("blocked");
        setState(subscription ? "on" : "off");
      })
      .catch(() => setState("failed"));
  }, []);

  async function enable() {
    setState("checking");
    try {
      const response = await fetch("/api/push");
      if (!response.ok) {
        setState("unsupported");
        setHint("Push is not configured on this server.");
        return;
      }
      const parsed = publicKeySchema.safeParse(await response.json());
      if (!parsed.success) {
        setState("failed");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(parsed.data.publicKey),
      });

      const saved = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setState(saved.ok ? "on" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "on") {
    return <span className="text-xs text-neutral-500">Notifications on</span>;
  }

  const actionable = state === "off" || state === "failed";

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void enable()}
        disabled={!actionable}
        className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
      >
        {LABEL[state]}
      </button>
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </span>
  );
}
