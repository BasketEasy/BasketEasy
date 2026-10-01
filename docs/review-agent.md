# Review agent

Autonomous PR review and merge. Workflow `.github/workflows/pr-review-agent.yml`, policy
`.github/review-agent/POLICY.md`, lenses `.claude/agents/review-*.md`.

Runs on `opened`, `ready_for_review`, `synchronize`, `reopened` (same-repo, non-draft).
Security, product, accessibility, coherence and scalability subagents review in parallel; the
lead agent verifies findings, posts inline comments (🔴 blocking, 🟡 nit, 🟣 pre-existing), and
writes a verdict. A final step with no LLM approves and squash-merges once CI is green, or
labels `needs-human` and pings the owner.

The LLM never holds merge rights. Infra and agent-config paths (`.github`, `.claude`,
`CLAUDE.md`, Dockerfiles, env), non-dependabot dependency changes, major bumps and labels are
a hard gate in the workflow; the agent can only add caution. Sensitive product modules and
diff size are judged by the agent under `POLICY.md`: it escalates only when a security
boundary is weakened or redefined.

## One-time setup (repo admin)

Works on a free private repo: no branch protection, rulesets or auto-merge needed.

1. Secret `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` locally (uses your Claude subscription, no per-token billing).
2. Secret `REVIEW_AGENT_TOKEN`: fine-grained PAT with `contents` and `pull_requests` write.
   Needed so a merge triggers `deploy.yml`.
3. Settings, Actions: allow Actions to create and approve pull requests.
4. Variable `REVIEW_AGENT_OWNER`: GitHub login to ping on escalation.

Without branch protection the workflow is the only gate, and anyone with write access can
still merge by hand. Minutes: nothing polls. The agent records a clearance status on the
head SHA; `.github/review-agent/merge.sh` merges when the other checks are green, called by the
verdict step or by `pr-review-agent-merge.yml` when CI, PR scope or Docker build finish,
whichever comes last. The main cost is the review job itself; `cancel-in-progress` drops
superseded runs, and draft PRs are skipped, so keep PRs in draft until ready.

## Controls

- Pause all merging: repo variable `REVIEW_AGENT_AUTOMERGE=false` (reviews continue).
- One PR: label `no-agent-merge`. Agent-flagged PRs get `needs-human`; remove it after you decide.
