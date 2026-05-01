#!/usr/bin/env bash
# Fails if common user-facing strings appear hardcoded in JSX.
# Run in CI and (optionally) as a pre-commit hook.
#
# Usage: bash scripts/check-hardcoded-strings.sh [--staged]
#   --staged  Only check files staged for commit.
set -e

# Patterns: JSX text nodes like `>Save<`, `>Cancel<`, etc.
# We look for common English buttons/labels that should have been translated.
PATTERNS=(
  ">Save<"
  ">Cancel<"
  ">Confirm<"
  ">Delete<"
  ">Remove<"
  ">Next<"
  ">Back<"
  ">Continue<"
  ">Done<"
  ">Submit<"
  ">Close<"
  ">Loading...<"
  ">Something went wrong<"
  ">Try again<"
)

# Build a single ripgrep alternation
RX=$(IFS='|'; echo "${PATTERNS[*]}")

# File scope
SCOPE_FILES=()
if [[ "${1:-}" == "--staged" ]]; then
  # Only staged .tsx files under src/
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    SCOPE_FILES+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR | grep -E '^src/.*\.tsx$' || true)
  if [[ ${#SCOPE_FILES[@]} -eq 0 ]]; then
    exit 0
  fi
fi

# Exclusions: files that are intentionally allowed to have English (i18n source files, dummy data)
EXCLUDE_GLOB='!src/i18n/**'
EXCLUDE_GLOB2='!src/utils/dummyData.ts'

if command -v rg >/dev/null 2>&1; then
  if [[ ${#SCOPE_FILES[@]} -gt 0 ]]; then
    MATCH=$(rg -n --no-heading -e "$RX" "${SCOPE_FILES[@]}" 2>/dev/null || true)
  else
    MATCH=$(rg -n --no-heading -e "$RX" \
      --glob "src/**/*.tsx" \
      --glob "$EXCLUDE_GLOB" \
      --glob "$EXCLUDE_GLOB2" \
      2>/dev/null || true)
  fi
else
  # ripgrep not available — fall back to grep
  if [[ ${#SCOPE_FILES[@]} -gt 0 ]]; then
    MATCH=$(grep -nE "$RX" "${SCOPE_FILES[@]}" 2>/dev/null || true)
  else
    MATCH=$(grep -rnE --include='*.tsx' "$RX" src/ 2>/dev/null \
      | grep -v '^src/i18n/' \
      | grep -v '^src/utils/dummyData.ts' \
      || true)
  fi
fi

if [[ -n "$MATCH" ]]; then
  echo ""
  echo "❌ Hardcoded English strings detected in JSX."
  echo "   Move them to src/i18n/en.ts + src/i18n/ms.ts and use useT()."
  echo ""
  echo "$MATCH"
  echo ""
  exit 1
fi

echo "✅ No hardcoded JSX strings detected."
exit 0
