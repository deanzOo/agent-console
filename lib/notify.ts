const MAX_BODY = 140;

export type NotificationKind = "awaiting_input" | "done" | "failed";

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
  awaiting_input: "Waiting on you",
  done: "Mission finished",
  failed: "Mission failed",
};

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function buildNotification(input: NotificationInput): Notification {
  const suffix =
    input.kind === "awaiting_input" && input.toolName ? ` · ${input.toolName}` : "";
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
