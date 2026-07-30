import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/config/env";
import { getDatabase } from "@/lib/db";
import { setupAccessAllowed } from "@/lib/setup-access";
import { setupState } from "@/lib/setup";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const request = new Request("http://setup.local/setup", {
    headers: await headers(),
  });
  if (!(await setupAccessAllowed(request))) redirect("/login?next=%2Fsetup");

  const config = getConfig();
  const state = setupState(getDatabase(), {
    authMode: config.authMode,
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });

  return <SetupWizard initial={state} authMode={config.authMode} />;
}
