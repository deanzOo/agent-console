import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ServerSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
}

interface Connection {
  readonly client: Client;
  readonly closed: Promise<void>;
}

const connections = new Map<string, Promise<Connection>>();

async function connect(spec: ServerSpec): Promise<Connection> {
  // process.env values are optional; the transport wants a dense record.
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) inherited[key] = value;
  }

  const transport = new StdioClientTransport({
    command: spec.command,
    args: [...spec.args],
    env: { ...inherited, ...spec.env },
  });

  const client = new Client({ name: "agent-console", version: "0.1.0" });

  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => {
      connections.delete(spec.name);
      resolve();
    };
  });

  await client.connect(transport);
  return { client, closed };
}

/** Lazily spawned and reused; a dead server is dropped so the next call respawns. */
export async function callTool(
  spec: ServerSpec,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let pending = connections.get(spec.name);
  if (!pending) {
    pending = connect(spec);
    connections.set(spec.name, pending);
  }

  try {
    const connection = await pending;
    return await connection.client.callTool({ name: toolName, arguments: args });
  } catch (error) {
    connections.delete(spec.name);
    throw error;
  }
}

export async function closeAll(): Promise<void> {
  for (const [name, pending] of [...connections]) {
    connections.delete(name);
    const connection = await pending.catch(() => undefined);
    await connection?.client.close().catch(() => undefined);
  }
}
