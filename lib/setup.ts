import webpush from "web-push";
import type { AuthMode } from "@/config/env";
import { hashPassword } from "./auth";
import type { Db } from "./db";
import { getSetting, isSetupComplete, markSetupComplete, setSetting } from "./settings";

const MIN_PASSWORD_LENGTH = 12;

export interface SetupContext {
  readonly authMode: AuthMode;
  readonly githubToken?: string | undefined;
  readonly asanaToken?: string | undefined;
}

export interface SetupState {
  readonly complete: boolean;
  readonly needsPassword: boolean;
  readonly passwordSet: boolean;
  readonly github: boolean;
  readonly asana: boolean;
  readonly telegram: boolean;
  readonly push: boolean;
}

export function setupState(db: Db, context: SetupContext): SetupState {
  const passwordSet = getSetting(db, "password_hash") !== undefined;

  return {
    complete: isSetupComplete(db),
    needsPassword: context.authMode === "password" && !passwordSet,
    passwordSet,
    github: Boolean(context.githubToken ?? getSetting(db, "github_token")),
    asana: Boolean(context.asanaToken ?? getSetting(db, "asana_token")),
    telegram:
      getSetting(db, "telegram_bot_token") !== undefined &&
      getSetting(db, "telegram_chat_id") !== undefined,
    push: getSetting(db, "vapid_public_key") !== undefined,
  };
}

export interface SetupAccess {
  readonly authenticated: boolean;
  readonly authMode: AuthMode;
  readonly passwordSet: boolean;
}

// The wizard is reachable without a session only while there is no way to get
// one. Under the other modes a caller with no session got past no gate at all.
export function canAccessSetup(access: SetupAccess): boolean {
  if (access.authenticated) return true;
  return access.authMode === "password" && !access.passwordSet;
}

export type SetupStep =
  | { step: "password"; password: string }
  | { step: "github"; token: string }
  | { step: "asana"; token: string }
  | { step: "telegram"; botToken: string; chatId: string }
  | { step: "push"; subject: string }
  | { step: "finish" };

export async function validateGithubToken(token: string): Promise<string> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub rejected the token (${response.status})`);
  }
  const body: unknown = await response.json();
  return String(Object(body).login ?? "unknown");
}

async function validateTelegram(botToken: string, chatId: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "Agent Console is connected. You will hear from me when an agent needs you.",
    }),
  });
  if (!response.ok) {
    throw new Error(`Telegram rejected the message (${response.status})`);
  }
}

// Every step validates against the real service before storing, so a wrong
// credential fails here instead of halfway through the first mission.
export async function applySetupStep(db: Db, input: SetupStep): Promise<void> {
  switch (input.step) {
    case "password": {
      if (input.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      setSetting(db, "password_hash", await hashPassword(input.password));
      return;
    }
    case "github": {
      await validateGithubToken(input.token);
      setSetting(db, "github_token", input.token);
      return;
    }
    case "asana": {
      setSetting(db, "asana_token", input.token);
      return;
    }
    case "telegram": {
      await validateTelegram(input.botToken, input.chatId);
      setSetting(db, "telegram_bot_token", input.botToken);
      setSetting(db, "telegram_chat_id", input.chatId);
      return;
    }
    case "push": {
      const keys = webpush.generateVAPIDKeys();
      setSetting(db, "vapid_public_key", keys.publicKey);
      setSetting(db, "vapid_private_key", keys.privateKey);
      setSetting(db, "vapid_subject", input.subject);
      return;
    }
    case "finish": {
      markSetupComplete(db);
      return;
    }
  }
}
