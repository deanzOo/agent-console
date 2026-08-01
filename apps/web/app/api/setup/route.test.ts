import { beforeEach, describe, expect, it, vi } from "vitest";

const setupAccessAllowed = vi.fn();
const setupState = vi.fn();
const applySetupStep = vi.fn();
const issueSession = vi.fn();
const getConfig = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/env", () => ({ getConfig }));
vi.mock("@agent-console/core/auth", () => ({
  SESSION_COOKIE: "session",
  issueSession,
}));
vi.mock("@agent-console/core/setup", () => ({ setupState, applySetupStep }));
vi.mock("@/lib/setup-access", () => ({ setupAccessAllowed }));

const { GET, POST } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get() {
  return GET(new Request("http://localhost/api/setup"));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAccessAllowed.mockResolvedValue(true);
  setupState.mockReturnValue({ complete: false, steps: {} });
  applySetupStep.mockResolvedValue(undefined);
  issueSession.mockResolvedValue("a-token");
  getConfig.mockReturnValue({ authMode: "password", sessionSecret: "s".repeat(32) });
});

describe("GET /api/setup", () => {
  it("reports what has been configured", async () => {
    await expect((await get()).json()).resolves.toEqual({ complete: false, steps: {} });
  });

  // The wizard is public in the middleware because a fresh install cannot
  // authenticate yet. Once it can, this is what closes it.
  it("refuses a caller who may no longer use the wizard", async () => {
    setupAccessAllowed.mockResolvedValue(false);

    expect((await get()).status).toBe(401);
    expect(setupState).not.toHaveBeenCalled();
  });
});

describe("POST /api/setup", () => {
  it("applies a step", async () => {
    const response = await POST(request({ step: "github", token: "t" }));

    expect(response.status).toBe(200);
    expect(applySetupStep).toHaveBeenCalledWith({}, { step: "github", token: "t" });
  });

  // Setting the password is what locks the wizard, so without this the very
  // next step — including Finish — would 401 the person who just set it.
  it("hands a session to whoever sets the password", async () => {
    const response = await POST(request({ step: "password", password: "hunter2" }));

    expect(response.cookies.get("session")?.value).toBe("a-token");
  });

  it("does not hand out a session for any other step", async () => {
    const response = await POST(request({ step: "asana", token: "t" }));

    expect(response.cookies.get("session")).toBeUndefined();
  });

  // Without a secret there is nothing to sign a session with; the step still
  // has to succeed.
  it("still applies the password step when no session secret is configured", async () => {
    getConfig.mockReturnValue({ authMode: "password", sessionSecret: undefined });

    const response = await POST(request({ step: "password", password: "hunter2" }));

    expect(response.status).toBe(200);
    expect(response.cookies.get("session")).toBeUndefined();
  });

  it("refuses a step it does not know", async () => {
    expect((await POST(request({ step: "sudo" }))).status).toBe(400);
    expect(applySetupStep).not.toHaveBeenCalled();
  });

  // A live credential check is the point of the wizard, so its reason reaches
  // the operator verbatim rather than as a generic failure.
  it("passes back why a credential was rejected", async () => {
    applySetupStep.mockRejectedValue(new Error("GitHub responded 401"));

    const response = await POST(request({ step: "github", token: "bad" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "GitHub responded 401" });
  });

  it("refuses an unauthorised caller before touching anything", async () => {
    setupAccessAllowed.mockResolvedValue(false);

    expect((await POST(request({ step: "finish" }))).status).toBe(401);
    expect(applySetupStep).not.toHaveBeenCalled();
  });
});
