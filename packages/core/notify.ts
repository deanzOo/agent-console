const MAX_BODY = 140;

import type { MissionStatus } from "./missions";
import { MISSION_STATUS } from "./schema";

export type NotificationKind =
  | typeof MISSION_STATUS.AWAITING_INPUT
  | typeof MISSION_STATUS.DONE
  | typeof MISSION_STATUS.FAILED;

export interface NotificationInput {
  readonly kind: NotificationKind;
  readonly missionId: string;
  readonly title: string;
  readonly toolName?: string | undefined;
}

export interface Notification {
  readonly title: string;
  readonly body: string;
  readonly url: string;
}

export interface Deliverer {
  readonly name: string;
  send(message: Notification): Promise<void>;
}

export interface DeliveryResult {
  readonly channel: string;
  readonly ok: boolean;
  readonly error?: string;
}

const HEADINGS: Record<NotificationKind, string> = {
  [MISSION_STATUS.AWAITING_INPUT]: "Waiting on you",
  [MISSION_STATUS.DONE]: "Mission finished",
  [MISSION_STATUS.FAILED]: "Mission failed",
};

/** Whether reaching this status is worth waking the operator for. */
export function isNotifiable(status: MissionStatus): status is NotificationKind {
  return status in HEADINGS;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function buildNotification(input: NotificationInput): Notification {
  const suffix =
    input.kind === MISSION_STATUS.AWAITING_INPUT && input.toolName
      ? ` · ${input.toolName}`
      : "";
  return {
    title: HEADINGS[input.kind],
    body: truncate(`${input.title}${suffix}`, MAX_BODY),
    url: `/missions/${input.missionId}`,
  };
}

// Never rejects and never throws: an alert that fails must not take down the
// agent loop that triggered it.
export async function deliver(
  channels: readonly Deliverer[],
  message: Notification,
): Promise<DeliveryResult[]> {
  return Promise.all(
    channels.map(async (channel) => {
      try {
        await channel.send(message);
        return { channel: channel.name, ok: true };
      } catch (error) {
        return {
          channel: channel.name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
