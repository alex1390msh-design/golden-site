#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root after:
#   supabase login
#   supabase link --project-ref YOUR_PROJECT_REF
#
# This script deploys Edge Functions only. It does not create a Supabase
# project, run database migrations, configure secrets, or enable payments.

FUNCTIONS=(
  create-order
  create-support-ticket
  list-my-orders
  list-my-support-tickets
  admin-update-ticket
  admin-save-product
  admin-list-products
  admin-list-tickets
  admin-list-orders
)

for fn in "${FUNCTIONS[@]}"; do
  echo "Deploying ${fn}..."
  supabase functions deploy "${fn}"
done

echo
echo "All Edge Functions deployed."
echo "Next: verify project secrets, Auth redirect URLs, RLS policies, and run the test checklist in backend/README_FA.md."
