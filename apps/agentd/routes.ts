export const AGENTD_ROUTES = {
  HEALTH: "/health",
  MISSIONS: "/missions",
} as const;

export type AgentdAction = "answer" | "interrupt" | "stop" | "events";

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
};

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
    const [, id, action] = segments;
    const known = action === undefined ? undefined : ACTIONS[action];
    if (id !== undefined && known !== undefined && known.method === request.method) {
      return { kind: "mission", id, action: known.action };
    }
  }

  return { kind: "unknown" };
}
