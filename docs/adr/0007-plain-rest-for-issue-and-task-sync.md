# 7. The dashboard's own reads go over plain REST

Date: 2026-07-31

## Status

Accepted. Supersedes the dashboard-read half of
[ADR-0002](0002-backend-as-mcp-client.md), which remains accepted for how **agents** reach these services.

## Context

ADR-0002 decided the backend would be an MCP client for both GitHub and Asana. GitHub never was: the token is
already required for cloning, and `fetch` is fewer moving parts than a child process for a list call. Asana
was, and it did not work.

Two failures, both discovered only by running it against a real account:

- **The MCP path called `asana_search_tasks`.** Asana answers that endpoint with
  `"Search is only available to premium users."` on a free plan. The error was swallowed somewhere between
  the MCP server and the parser, arrived as an empty result, and the sync reported success. An account with
  nine assigned tasks showed zero, with nothing anywhere to say why.
- **The MCP server is fetched at runtime**, as `npx -y @roychri/mcp-server-asana`, inside the container. That
  is a download on first use, on a box that may have no registry access, with a failure mode of a child
  process that never becomes ready.

## Decision

The dashboard's read path — listing issues and tasks — uses each service's REST API directly.

`GET /tasks?workspace=…&assignee=me&completed_since=now` returns your incomplete tasks and works on every
plan. It is also a better fit for the screen: a dashboard wants _your_ tasks, not everything in the workspace.

Errors are raised with the service's own message rather than reduced to an empty list.

## Consequences

The Asana integration works on a free plan, needs no child process, and downloads nothing at runtime. #24's
concern about `npx`-at-runtime disappears with the code that caused it.

ADR-0002's reasoning still stands for the other half: **agents** get MCP servers, because that is how a model
uses a tool. Nothing here changes that. What changes is that the dashboard's own queries — a list of issues,
a list of tasks — never needed a model-facing protocol to make them.

The cost is one more API surface written by hand, and it is small: both are a single authenticated `GET`.
