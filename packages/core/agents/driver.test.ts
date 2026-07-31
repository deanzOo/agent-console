import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryCall {
  readonly options: Record<string, unknown>;
}

const queryMock = vi.fn((_call: QueryCall) => ({
  interrupt: vi.fn(),
  close: vi.fn(),
  [Symbol.asyncIterator]: async function* () {
    // A driver test never consumes messages; the option bag is the subject.
  },
}));
const getConfigMock = vi.fn();

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: queryMock }));
vi.mock("../env", () => ({ getConfig: getConfigMock }));

const { createSdkDriver } = await import("./driver");

function start(claudeCliPath: string | undefined) {
  getConfigMock.mockReturnValue({ claudeCliPath });
  createSdkDriver().start({
    prompt: "hi",
    cwd: "/tmp/wt",
    canUseTool: async () => ({ behavior: "allow", updatedInput: {} }),
  });
  return queryMock.mock.calls.at(-1)?.[0].options;
}

beforeEach(() => {
  queryMock.mockClear();
});

describe("createSdkDriver", () => {
  // The SDK's own binary is linked against a libc that need not match the
  // host. Where they disagree it exists and refuses to launch, and every
  // mission dies at startup — so this option is what makes the container work.
  it("spawns the configured CLI when one is named", () => {
    expect(start("/usr/local/bin/claude")).toMatchObject({
      pathToClaudeCodeExecutable: "/usr/local/bin/claude",
    });
  });

  it("leaves the choice to the SDK when no path is configured", () => {
    expect(start(undefined)).not.toHaveProperty("pathToClaudeCodeExecutable");
  });

  it("still passes the mission's working directory and permission mode", () => {
    expect(start("/usr/local/bin/claude")).toMatchObject({
      cwd: "/tmp/wt",
      permissionMode: "default",
    });
  });

  // Stopping a mission and cleaning it up both go through here. A driver that
  // swallowed either would leave a session running with nothing pointing at it.
  it("forwards interrupt and close to the SDK handle", async () => {
    getConfigMock.mockReturnValue({ claudeCliPath: undefined });
    const run = createSdkDriver().start({
      prompt: "hi",
      cwd: "/tmp/wt",
      canUseTool: async () => ({ behavior: "allow", updatedInput: {} }),
    });
    const handle = queryMock.mock.results.at(-1)?.value;

    await run.interrupt();
    run.close();

    expect(handle?.interrupt).toHaveBeenCalledOnce();
    expect(handle?.close).toHaveBeenCalledOnce();
  });
});
