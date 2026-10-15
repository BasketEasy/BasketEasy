#!/usr/bin/env bash
# Tests for merge.sh with a fake `gh` on PATH. Run: bash .github/review-agent/merge.test.sh
# The fake answers from FAKE_* env vars and appends every call to $CALLS, so each case
# asserts both the exit code and which mutating commands (review, merge, label) ran.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"

cat >"$work/bin/gh" <<'FAKE'
#!/usr/bin/env bash
echo "gh $*" >>"$CALLS"
# Mimic gh's -q: apply the filter to the canned JSON with jq.
q=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do [ "${args[i]}" = "-q" ] && q="${args[i + 1]}"; done
default_checks='[{"workflow":"CI","bucket":"pass"}]'
case "$1 $2" in
  "pr view") echo "${FAKE_PR:-$(printf 'OPEN\tsha1\t')}" ;;
  "pr checks") echo "${FAKE_CHECKS:-$default_checks}" | jq -c "$q" ;;
  "api repos/o/r/commits/sha1/statuses") echo "${FAKE_STATUSES:-[]}" | jq -r "$q" ;;
esac
exit 0
FAKE
chmod +x "$work/bin/gh"

fail=0
# run <name> <expected: merged|held|labelled|none> [VAR=value ...]
run() {
  local name=$1 expect=$2
  shift 2
  : >"$work/calls"
  env -i PATH="$work/bin:$PATH" CALLS="$work/calls" PR=7 REPO=o/r SHA=sha1 GH_TOKEN=bot "$@" \
    bash "$here/merge.sh" >"$work/out" 2>&1
  local rc=$? got=none
  grep -q "pr merge" "$work/calls" && got=merged
  [ "$got" = none ] && grep -q "add-label needs-human" "$work/calls" && got=labelled
  [ "$expect" = held ] && expect=none
  if [ "$rc" -ne 0 ] || [ "$got" != "$expect" ]; then
    echo "FAIL $name: rc=$rc got=$got expected=$expect"; cat "$work/out"; fail=1
  else
    echo "ok   $name"
  fi
}

good='[{"context":"review-agent/verdict","state":"success","description":"fine","creator":{"login":"github-actions[bot]"}}]'
forged='[{"context":"review-agent/verdict","state":"success","description":"fine","creator":{"login":"mallory"}}]'
# A forged success newer than the workflow's own failure must not win either.
forged_over_denied='[{"context":"review-agent/verdict","state":"success","description":"x","creator":{"login":"mallory"}},{"context":"review-agent/verdict","state":"failure","description":"not cleared","creator":{"login":"github-actions[bot]"}}]'

run "merges when cleared and green" merged FAKE_STATUSES="$good" MERGE_TOKEN=pat
run "fails closed without the PAT" labelled FAKE_STATUSES="$good"
run "refuses a status from another identity" held FAKE_STATUSES="$forged" MERGE_TOKEN=pat
run "forged success cannot override a denial" held FAKE_STATUSES="$forged_over_denied" MERGE_TOKEN=pat
run "no clearance" held MERGE_TOKEN=pat
run "superseded head" held FAKE_STATUSES="$good" MERGE_TOKEN=pat FAKE_PR="$(printf 'OPEN\tother\t')"
run "closed PR" held FAKE_STATUSES="$good" MERGE_TOKEN=pat FAKE_PR="$(printf 'MERGED\tsha1\t')"
run "needs-human label holds" held FAKE_STATUSES="$good" MERGE_TOKEN=pat FAKE_PR="$(printf 'OPEN\tsha1\tneeds-human')"
run "failing check holds" held FAKE_STATUSES="$good" MERGE_TOKEN=pat FAKE_CHECKS='[{"workflow":"CI","bucket":"fail"}]'
run "pending check holds" held FAKE_STATUSES="$good" MERGE_TOKEN=pat FAKE_CHECKS='[{"workflow":"CI","bucket":"pending"}]'
run "skipping checks count as green" merged FAKE_STATUSES="$good" MERGE_TOKEN=pat \
  FAKE_CHECKS='[{"workflow":"CI","bucket":"pass"},{"workflow":"Docker build","bucket":"skipping"}]'
run "no checks yet holds" held FAKE_STATUSES="$good" MERGE_TOKEN=pat FAKE_CHECKS='[]'

exit "$fail"
