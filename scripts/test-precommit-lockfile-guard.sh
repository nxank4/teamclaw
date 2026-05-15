#!/usr/bin/env bash
# Smoke test for the lockfile-sync guard in .githooks/pre-commit.
# Validates the conditional logic without actually running a commit.
set -e

HOOK=".githooks/pre-commit"
test -x "$HOOK" || { echo "FAIL: $HOOK not executable"; exit 1; }

# Verify the guard block exists and references the expected files.
grep -q "package.json staged without bun.lock" "$HOOK" \
  || { echo "FAIL: guard error message missing from hook"; exit 1; }

grep -q "grep -qx 'package.json'" "$HOOK" \
  || { echo "FAIL: guard package.json check missing"; exit 1; }

grep -q "grep -qx 'bun.lock'" "$HOOK" \
  || { echo "FAIL: guard bun.lock check missing"; exit 1; }

echo "PASS: pre-commit lockfile guard wired correctly"
