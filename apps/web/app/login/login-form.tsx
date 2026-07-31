"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setBusy(false);
    if (!response.ok) {
      setError(true);
      return;
    }

    router.push(params.get("next") ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 pt-16">
      <h1 className="text-lg font-semibold">Agent Console</h1>
      <input
        type="password"
        value={password}
        autoFocus
        placeholder="Password"
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      {error && <p className="text-sm text-red-600">That password was not accepted.</p>}
      <button
        type="submit"
        disabled={busy || password === ""}
        className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
