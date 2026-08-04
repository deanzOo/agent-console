import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { z } from "zod";

/**
 * Reads an Open Knowledge Format bundle — a directory of markdown files, each
 * one a concept, with YAML frontmatter describing it.
 *
 * The format asks consumers to be forgiving, and the reason is practical: a
 * bundle is written by an operator by hand, or generated, and a single bad file
 * must not cost the mission every other concept in it. So anything unreadable
 * is left out rather than thrown over.
 *
 * https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
 */

// Defined meaning at any level of the tree: a directory listing and a history.
// Neither is a concept.
const RESERVED = ["index.md", "log.md"];

// `type` is the only key the format requires. Everything else is optional, so
// everything else is optional here.
const frontmatterSchema = z.object({
  type: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "stable", "deprecated"]).optional(),
});

export interface Concept {
  /** Bundle-relative, so it reads the same as the links inside the bundle. */
  readonly path: string;
  readonly type: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly status?: "draft" | "stable" | "deprecated" | undefined;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

function readConcept(file: string, relative: string): Concept | undefined {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }

  const matched = FRONTMATTER.exec(raw);
  if (!matched?.[1]) return undefined;

  let parsed: unknown;
  try {
    parsed = load(matched[1]);
  } catch {
    // Hand-written YAML, and a bundle is worth more than its worst file.
    return undefined;
  }

  const fields = frontmatterSchema.safeParse(parsed);
  if (!fields.success) return undefined;

  return { path: relative, ...fields.data };
}

function walk(root: string, directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(path.join(root, directory), { withFileTypes: true });
  } catch {
    // No bundle configured, or a path that is not there: a deployment without
    // one, not a fault.
    return [];
  }

  return entries.flatMap((entry) => {
    const relative = directory ? path.join(directory, entry.name) : entry.name;
    if (entry.isDirectory()) return walk(root, relative);
    if (!entry.name.endsWith(".md")) return [];
    if (RESERVED.includes(entry.name)) return [];
    return [relative];
  });
}

export function readBundle(root: string): Concept[] {
  return walk(root, "")
    .sort()
    .flatMap((relative) => readConcept(path.join(root, relative), relative) ?? []);
}

/**
 * What the agent is told about the bundle.
 *
 * A list of what exists and where to read it, rather than the concepts
 * themselves: the point of the bundle is to save context, and pasting it in
 * would spend the thing it saves. The agent opens what the task turns out to
 * need.
 */
export function describeBundle(
  concepts: Concept[],
  mountedAt: string,
): string | undefined {
  if (concepts.length === 0) return undefined;

  const lines = concepts.map((concept) => {
    const name = concept.title ?? concept.path;
    const summary = concept.description ? ` — ${concept.description}` : "";
    // Absent means stable, per the format, so neither is worth saying.
    const status =
      !concept.status || concept.status === "stable" ? "" : ` [${concept.status}]`;
    return `- ${name} (${concept.type})${status}${summary}\n  ${path.join(mountedAt, concept.path)}`;
  });

  return [
    "Knowledge about this deployment is available to you as files. Read the ones",
    "the task needs; they are not repeated here.",
    "",
    ...lines,
  ].join("\n");
}
