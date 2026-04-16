#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Smart Attendance — GitHub branch protection bootstrap
#
# Applies protection rules on `main` and `develop` for the repo given
# as first arg (default: thphuc273/smart-attendance).
#
# Rules:
#   main    — strict: require PR, linear history, no force-push, no
#             branch deletion, required review count = 1 (solo dev can
#             self-approve via GitHub web only if branch protection
#             exempts repo admin; we keep enforce_admins=false).
#   develop — lenient: require PR, no required reviews (faster iteration),
#             no force-push, no deletion.
#
# Usage:
#   ./scripts/setup-branch-protection.sh [owner/repo]
#
# Requires: gh CLI authenticated with repo admin.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${1:-thphuc273/smart-attendance}"

echo "→ Protecting main on $REPO"
gh api -X PUT "repos/$REPO/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo "→ Protecting develop on $REPO"
gh api -X PUT "repos/$REPO/branches/develop/protection" \
  --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo ""
echo "✓ Protection applied. Verify:"
echo "   gh api repos/$REPO/branches/main/protection | jq"
echo "   gh api repos/$REPO/branches/develop/protection | jq"
