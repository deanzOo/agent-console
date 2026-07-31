"use client";

import { MIN_PASSWORD_LENGTH } from "@agent-console/core/limits";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface State {
  complete: boolean;
  needsPassword: boolean;
  passwordSet: boolean;
  github: boolean;
  asana: boolean;
  telegram: boolean;
  push: boolean;
}

export function SetupWizard({
  initial,
  authMode,
}: {
  initial: State;
  authMode: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);

    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(String(result.error ?? `Failed (${response.status})`));
      return false;
    }

    const refreshed = await fetch("/api/setup").then((r) => r.json());
    setState(refreshed);
    // The nav is a server component, so client state cannot reach it: a step
    // that enables a feature leaves it hidden until a full reload. Configuring
    // push and then not finding the button is the first thing that happens to
    // a new operator.
    router.refresh();
    return true;
  }

  async function finish() {
    if (!(await submit({ step: "finish" }))) return;
    router.push("/");
    router.refresh();
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Set up the console</h1>
        <p className="text-sm text-neutral-500">
          Each step is checked against the real service before it is saved.
        </p>
      </header>

      {error && (
        <p className="rounded border border-red-400 bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </p>
      )}

      {state.needsPassword && (
        <Step title="Password" done={state.passwordSet} required>
          <Field
            label={`At least ${MIN_PASSWORD_LENGTH} characters`}
            type="password"
            busy={busy}
            onSubmit={(password) => submit({ step: "password", password })}
          />
        </Step>
      )}

      {authMode === "cloudflare-access" && (
        <p className="text-sm text-neutral-500">
          Authentication is handled by Cloudflare Access — nothing to set here.
        </p>
      )}

      <Step title="GitHub" done={state.github}>
        <p className="mb-2 text-xs text-neutral-500">
          Fine-grained token with Contents, Issues and Pull requests write access.
          Enables the issues panel and lets agents open pull requests.
        </p>
        <Field
          label="github_pat_…"
          type="password"
          busy={busy}
          onSubmit={(token) => submit({ step: "github", token })}
        />
      </Step>

      <Step title="Asana" done={state.asana}>
        <Field
          label="Personal access token"
          type="password"
          busy={busy}
          onSubmit={(token) => submit({ step: "asana", token })}
        />
      </Step>

      <Step title="Telegram" done={state.telegram}>
        <p className="mb-2 text-xs text-neutral-500">
          Sends a test message now. More reliable on a phone than web push.
        </p>
        <TwoField
          busy={busy}
          labels={["Bot token", "Chat id"]}
          onSubmit={(botToken, chatId) =>
            submit({ step: "telegram", botToken, chatId })
          }
        />
      </Step>

      <Step title="Web push" done={state.push}>
        <p className="mb-2 text-xs text-neutral-500">
          Generates a VAPID keypair for you. Install the console to your home screen to
          receive notifications.
        </p>
        <Field
          label="mailto:you@example.com"
          type="text"
          busy={busy}
          onSubmit={(subject) => submit({ step: "push", subject })}
        />
      </Step>

      <button
        type="button"
        onClick={finish}
        disabled={busy || state.needsPassword}
        className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        Finish setup
      </button>
    </main>
  );
}

function Step({
  title,
  done,
  required,
  children,
}: {
  title: string;
  done: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  // A configured step used to hide its form for good, so a token could be set
  // exactly once and never rotated — and this page is the only place to set
  // one. Configured means collapsed, not sealed.
  const [replacing, setReplacing] = useState(false);

  return (
    <section className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span>
          {title}{" "}
          <span className="text-xs font-normal text-neutral-500">
            {done ? "· configured" : required ? "· required" : "· optional"}
          </span>
        </span>
        {done && (
          <button
            type="button"
            onClick={() => setReplacing((open) => !open)}
            className="ml-auto rounded border border-neutral-300 px-2 py-0.5 text-xs font-normal dark:border-neutral-700"
          >
            {replacing ? "Cancel" : "Replace"}
          </button>
        )}
      </h2>
      {(!done || replacing) && children}
    </section>
  );
}

function Field({
  label,
  type,
  busy,
  onSubmit,
}: {
  label: string;
  type: string;
  busy: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        type={type}
        value={value}
        placeholder={label}
        onChange={(event) => setValue(event.target.value)}
        className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      <button
        type="button"
        disabled={busy || value.trim() === ""}
        onClick={() => onSubmit(value)}
        className="rounded border border-neutral-400 px-3 text-sm disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

function TwoField({
  labels,
  busy,
  onSubmit,
}: {
  labels: [string, string];
  busy: boolean;
  onSubmit: (a: string, b: string) => void;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  return (
    <div className="space-y-2">
      <input
        type="password"
        value={first}
        placeholder={labels[0]}
        onChange={(event) => setFirst(event.target.value)}
        className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      <div className="flex gap-2">
        <input
          value={second}
          placeholder={labels[1]}
          onChange={(event) => setSecond(event.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        />
        <button
          type="button"
          disabled={busy || first.trim() === "" || second.trim() === ""}
          onClick={() => onSubmit(first, second)}
          className="rounded border border-neutral-400 px-3 text-sm disabled:opacity-50"
        >
          Test & save
        </button>
      </div>
    </div>
  );
}
