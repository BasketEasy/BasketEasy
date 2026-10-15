#!/usr/bin/env bash
# Merge a PR the agent cleared, once every other check is green on that exact head.
# No polling: called by the verdict step and by pr-review-agent-merge.yml when CI ends,
# so whichever finishes last performs the merge. Idempotent, exits 0 when not ready.
# Env: PR, REPO, SHA, GH_TOKEN, MERGE_TOKEN (the PAT: required, so the merge triggers deploy.yml),
#      VERDICT_AUTHOR (login that writes the clearance status, default github-actions[bot]).
set -euo pipefail

state=$(gh pr view "$PR" --repo "$REPO" --json state,headRefOid,labels \
  -q '[.state, .headRefOid, ([.labels[].name] | join(","))] | @tsv')
IFS=$'\t' read -r pr_state head labels <<<"$state"

[ "$pr_state" = "OPEN" ] || { echo "not open"; exit 0; }
[ "$head" = "$SHA" ] || { echo "superseded"; exit 0; }
case ",$labels," in *,needs-human,* | *,no-agent-merge,*) echo "held by label"; exit 0 ;; esac

# The agent's clearance is a commit status on this exact SHA: a new push has none.
# Only the workflow's own token (creator github-actions[bot]) can clear: any other
# identity with `statuses: write` could otherwise forge it. The API lists newest first.
author="${VERDICT_AUTHOR:-github-actions[bot]}"
verdict=$(gh api "repos/$REPO/commits/$SHA/statuses" \
  -q "[.[] | select(.context==\"review-agent/verdict\" and .creator.login==\"$author\")][0] | [.state, .description] | @tsv" || true)
IFS=$'\t' read -r v_state v_desc <<<"${verdict:-}"
[ "${v_state:-}" = "success" ] || { echo "no agent clearance on this head"; exit 0; }

checks=$(gh pr checks "$PR" --repo "$REPO" --json workflow,bucket \
  -q '[.[] | select(.workflow | startswith("PR review agent") | not)]')
[ "$(jq length <<<"$checks")" -gt 0 ] || { echo "no checks yet"; exit 0; }
if [ "$(jq '[.[] | select(.bucket=="fail" or .bucket=="cancel")] | length' <<<"$checks")" -gt 0 ]; then
  echo "checks failing"; exit 0
fi
[ "$(jq '[.[] | select(.bucket=="pending")] | length' <<<"$checks")" -eq 0 ] || { echo "checks pending"; exit 0; }

# Fail closed: a GITHUB_TOKEN merge fires no push event, so deploy.yml would never run and
# main would be merged but undeployed. Hold the PR for a human instead of approving it.
if [ -z "${MERGE_TOKEN:-}" ]; then
  echo "::error::REVIEW_AGENT_TOKEN unset: not merging PR #$PR (a GITHUB_TOKEN merge triggers no deploy). Labelled needs-human."
  gh pr edit "$PR" --repo "$REPO" --add-label needs-human >/dev/null || true
  exit 0
fi

gh pr review "$PR" --repo "$REPO" --approve --body "${v_desc:-Reviewed by the agent, CI green.}"

GH_TOKEN="$MERGE_TOKEN" gh pr merge "$PR" --repo "$REPO" --squash --delete-branch
