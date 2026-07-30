# Your first mission

By the end you will have run one mission from your phone and answered the question it stopped on.

You need the console [deployed](../how-to/deploy.md) or running locally with `npm run dev`, and `/setup`
completed.

## 1. Start a mission

On the dashboard, tap **Start a mission** and describe the work in a sentence:

> Add a `--version` flag to the CLI and update the README.

Leave the repository field blank for now — a mission without one runs in the workspace root and cannot
touch your code. Tap **Start**.

You land on the mission page. The first entry in the transcript is your request.

## 2. Watch it work

The transcript streams as the agent thinks and acts. Read-only tools run without asking: reading files,
searching, listing directories. Nothing that writes or executes gets that freedom.

## 3. Answer the question

The moment the agent reaches for something that changes state, it stops. An amber panel appears showing the
tool and its exact arguments, with **Allow** and **Deny**.

That pause is real: the agent is blocked on a promise the server has not resolved. It will wait as long as
you need. Lock your phone and come back — the transcript resumes where it left off, because every event is
persisted with a sequence number.

Tap **Allow**. The agent continues.

## 4. Try denying

Start another mission and deny the first thing it asks for. The denial is passed back as a tool result, so
the agent sees it and adapts rather than crashing.

## Next

- Point a mission at a repository: it gets its own git worktree and branch, so two missions on the same repo
  never collide.
- Turn on notifications in `/setup` so you find out you are the blocker without watching the screen.
- Start work from a [GitHub issue or Asana task](../how-to/deploy.md) with one tap.
