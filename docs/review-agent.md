# Review agent

Autonomous PR review and merge. Workflow `.github/workflows/pr-review-agent.yml`, policy
`.github/review-agent/POLICY.md`, lenses `.claude/agents/review-*.md`.

Runs on `opened`, `ready_for_review`, `synchronize`, `reopened` (same-repo, non-draft).
Security, product, accessibility, coherence and scalability subagents review in parallel; the
lead agent verifies findings, posts inline comments (🔴 blocking, 🟡 nit, 🟣 pre-existing), and
writes a verdict. A final step with no LLM approves and enables squash auto-merge, or
labels `needs-human` and pings the owner.

The LLM never holds merge rights. Owner-only paths, dependency changes, diffs over 800 lines
and labels are a hard gate in the workflow; the agent can only add caution.

## One-time setup (repo admin)

1. Secret `ANTHROPIC_API_KEY`.
2. Secret `REVIEW_AGENT_TOKEN`: fine-grained PAT or GitHub App token with `contents` and
   `pull_requests` write. Needed so a merge triggers `deploy.yml`.
3. Settings, Actions: allow Actions to create and approve pull requests.
4. Settings, General: allow auto-merge, squash only, delete branch on merge.
5. Branch protection on `main`: require CI jobs (`format`, `lint`, `test`, `test-db`, `build`),
   dismiss stale approvals, require 1 approval, no bypass. Auto-merge then waits for green CI.
6. Variable `REVIEW_AGENT_OWNER`: GitHub login to ping on escalation.

## Controls

- Pause all merging: repo variable `REVIEW_AGENT_AUTOMERGE=false` (reviews continue).
- One PR: label `no-agent-merge`. Agent-flagged PRs get `needs-human`; remove it after you decide.
