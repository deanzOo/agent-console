export interface AsanaTaskRef {
  readonly token: string;
  readonly taskGid: string;
  readonly workspaceGid: string;
}

async function request(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://app.asana.com/api/1.0${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
}

async function asanaJson(response: Response, verb: string): Promise<unknown> {
  if (!response.ok) throw new Error(`Asana responded ${response.status} ${verb}`);
  return response.json();
}

async function findTag(
  ref: Pick<AsanaTaskRef, "token" | "workspaceGid">,
  name: string,
): Promise<string | undefined> {
  const response = await request(
    ref.token,
    `/tags?workspace=${ref.workspaceGid}&opt_fields=name`,
  );
  const body = await asanaJson(response, "listing tags");
  const tags: unknown = Object(body).data;
  const found = (Array.isArray(tags) ? tags : []).find(
    (tag: unknown) => Object(tag).name === name,
  );
  const gid: unknown = Object(found).gid;
  return typeof gid === "string" ? gid : undefined;
}

async function ensureTag(
  ref: Pick<AsanaTaskRef, "token" | "workspaceGid">,
  name: string,
): Promise<string> {
  const found = await findTag(ref, name);
  if (found) return found;

  const created = await request(ref.token, "/tags", {
    method: "POST",
    body: JSON.stringify({ data: { name, workspace: ref.workspaceGid } }),
  });
  const body = await asanaJson(created, `creating the "${name}" tag`);
  const gid: unknown = Object(Object(body).data).gid;
  if (typeof gid !== "string") {
    throw new Error(`Asana did not return an id for the "${name}" tag it created`);
  }
  return gid;
}

/** Tags the task, creating the tag on the workspace first if nothing else ever has. */
export async function addAsanaTaskTag(ref: AsanaTaskRef, name: string): Promise<void> {
  const tagGid = await ensureTag(ref, name);
  const response = await request(ref.token, `/tasks/${ref.taskGid}/addTag`, {
    method: "POST",
    body: JSON.stringify({ data: { tag: tagGid } }),
  });
  await asanaJson(response, "tagging the task");
}

export async function removeAsanaTaskTag(
  ref: AsanaTaskRef,
  name: string,
): Promise<void> {
  const tagGid = await findTag(ref, name);
  // No tag on the workspace at all means there is nothing on the task to
  // take off — the same "already gone" case the GitHub side treats as a 404.
  if (!tagGid) return;

  const response = await request(ref.token, `/tasks/${ref.taskGid}/removeTag`, {
    method: "POST",
    body: JSON.stringify({ data: { tag: tagGid } }),
  });
  await asanaJson(response, "untagging the task");
}

export async function commentOnAsanaTask(
  ref: Pick<AsanaTaskRef, "token" | "taskGid">,
  text: string,
): Promise<void> {
  const response = await request(ref.token, `/tasks/${ref.taskGid}/stories`, {
    method: "POST",
    body: JSON.stringify({ data: { text } }),
  });
  await asanaJson(response, "commenting on the task");
}
