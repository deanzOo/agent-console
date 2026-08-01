export const AGENTD_ROUTES = {
  HEALTH: "/health",
  MISSIONS: "/missions",
} as const;

export type AgentdAction = "answer" | "interrupt" | "stop" | "events" | "say" | "mode";

export interface AgentdRequest {
  readonly method: string;
  readonly pathname: string;
}

export type AgentdRoute =
  | { readonly kind: "health" }
  | { readonly kind: "launch" }
  | { readonly kind: "mission"; readonly id: string; readonly action: AgentdAction }
  | { readonly kind: "unknown" };

const ACTIONS: Record<string, { action: AgentdAction; method: string }> = {
  answer: { action: "answer", method: "POST" },
  interrupt: { action: "interrupt", method: "POST" },
  stop: { action: "stop", method: "POST" },
  events: { action: "events", method: "GET" },
  say: { action: "say", method: "POST" },
  mode: { action: "mode", method: "POST" },
};

// The caller percent-encodes the id, so it has to be decoded here or an id
// containing a reserved character never matches the row it names. A malformed
// escape is not a mission id, so it resolves to nothing rather than throwing.
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

// Routing is separated from the server so it can be tested without a socket,
// the same reason repos.ts is split from git.ts.
export function matchRoute(request: AgentdRequest): AgentdRoute {
  const segments = request.pathname.split("/").filter((part) => part !== "");

  if (request.method === "GET" && segments.length === 1 && segments[0] === "health") {
    return { kind: "health" };
  }

  if (segments[0] !== "missions") return { kind: "unknown" };

  if (request.method === "POST" && segments.length === 1) return { kind: "launch" };

  if (segments.length === 3) {
    const [, encodedId, action] = segments;
    const known = action === undefined ? undefined : ACTIONS[action];
    const id = encodedId === undefined ? undefined : decodeSegment(encodedId);
    if (id !== undefined && known !== undefined && known.method === request.method) {
      return { kind: "mission", id, action: known.action };
    }
  }

  return { kind: "unknown" };
}
