#!/usr/bin/env bash
# Validate the local cross-artifact contracts for one Bigpowers epic capsule.
# This intentionally uses only Bash/grep/awk so it can run in the repository's
# supported development environments without adding a YAML parser dependency.
set -euo pipefail

capsule_dir=${1:-}
if [[ -z "$capsule_dir" || ! -d "$capsule_dir" ]]; then
  echo "CRITICAL: Usage: bash scripts/lib/plan-consistency-check.sh specs/epics/<capsule-dir>" >&2
  exit 2
fi

manifest="$capsule_dir/epic.yaml"
if [[ ! -f "$manifest" ]]; then
  echo "CRITICAL: Missing epic manifest: $manifest" >&2
  exit 1
fi

critical=0
high=0
med=0

report() {
  local severity=$1
  shift
  printf '%s: %s\n' "$severity" "$*" >&2
  case "$severity" in
    CRITICAL) critical=$((critical + 1)) ;;
    HIGH) high=$((high + 1)) ;;
    MED) med=$((med + 1)) ;;
  esac
}

task_files=()
while IFS= read -r task_file; do
  task_files+=("$task_file")
done < <(find "$capsule_dir" -maxdepth 1 -type f -name '*-tasks.yaml' -print | sort)

if (( ${#task_files[@]} == 0 )); then
  report CRITICAL "No story task ledger found in $capsule_dir"
fi

for task_file in "${task_files[@]}"; do
  story_id=$(awk -F': ' '/^story_id: / { print $2; exit }' "$task_file")
  story_title=$(awk -F': ' '/^title: / { print $2; exit }' "$task_file")
  story_status=$(awk -F': ' '/^status: / { print $2; exit }' "$task_file")
  story_bcps=$(awk -F': ' '/^bcps: / { print $2; exit }' "$task_file")
  story_risk=$(awk -F': ' '/^risk: / { print $2; exit }' "$task_file")

  [[ -n "$story_id" ]] || report CRITICAL "$task_file is missing story_id"
  [[ -n "$story_title" ]] || report HIGH "$task_file is missing title"
  [[ "$story_status" =~ ^(todo|failing|passing|blocked)$ ]] || report HIGH "$task_file has invalid or missing story status"
  [[ "$story_bcps" =~ ^[0-9]+$ ]] || report HIGH "$task_file has invalid or missing bcps"
  [[ "$story_risk" =~ ^P[0-3]$ ]] || report HIGH "$task_file has invalid or missing risk"

  if [[ -n "$story_id" ]]; then
    manifest_story=$(awk -v id="$story_id" '
      $0 == "  - id: " id { in_story=1; next }
      in_story && /^  - id: / { exit }
      in_story && $0 ~ /^    tasks: / { sub(/^    tasks: /, ""); print; exit }
    ' "$manifest")
    expected_task_file=$(basename "$task_file")
    [[ "$manifest_story" == "$expected_task_file" ]] || report CRITICAL "$story_id does not map to $expected_task_file in $manifest"

    story_spec=$(find "$capsule_dir" -maxdepth 1 -type f -name "${story_id}-*.md" -print -quit)
    [[ -n "$story_spec" ]] || report HIGH "$story_id has no countable story specification (*.md)"
  fi

  task_count=$(grep -Ec '^  - id: ' "$task_file" || true)
  (( task_count > 0 )) || report CRITICAL "$task_file has no runnable tasks"

  for field in description verify risk status; do
    field_count=$(grep -Ec "^    ${field}:" "$task_file" || true)
    [[ "$field_count" -eq "$task_count" ]] || report HIGH "$task_file must define $field for every task ($field_count/$task_count found)"
  done

  allure_count=$(grep -Ec '^    allure:' "$task_file" || true)
  severity_count=$(grep -Ec '^      severity: (critical|high|normal|minor)$' "$task_file" || true)
  category_count=$(grep -Ec '^      categories:' "$task_file" || true)
  [[ "$allure_count" -eq "$task_count" ]] || report HIGH "$task_file must define allure for every task ($allure_count/$task_count found)"
  [[ "$severity_count" -eq "$task_count" ]] || report HIGH "$task_file must define valid Allure severity for every task ($severity_count/$task_count found)"
  [[ "$category_count" -eq "$task_count" ]] || report HIGH "$task_file must define Allure categories for every task ($category_count/$task_count found)"
done

if (( critical > 0 || high > 0 )); then
  printf 'FAIL: %d critical, %d high, %d med finding(s)\n' "$critical" "$high" "$med" >&2
  exit 1
fi

if (( med > 0 )); then
  printf 'CONCERNS: %d med finding(s)\n' "$med" >&2
else
  printf 'PASS: %s is structurally consistent\n' "$capsule_dir"
fi
