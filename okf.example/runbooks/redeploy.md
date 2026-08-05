---
type: Runbook
title: Redeploying the console
description: How this deployment ships a change, and what it does to running missions.
tags: [operations, deploy]
status: stable
---

# When

After a pull request merges and the gate is green on the default branch.

# Steps

Replace with your own. Name the script, the host alias, and what to check afterwards — an agent asked to
"deploy the fix" will follow this literally, so vagueness here becomes a wrong command there.

# What it does to missions

Restarting the session host no longer ends a mission: it resumes what was live, or records why it did not. An
approval that was open when it went down is closed, and the agent asks again.
