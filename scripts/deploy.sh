#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy the current git HEAD commit to Railway via the GraphQL API.
#
# WHY THIS EXISTS: this Railway service has NO GitHub App installation
# (autoDeployStatus.reason = "NO_INSTALLATION"), so pushes do NOT auto-deploy.
# This script deploys an EXACT commit SHA on demand.
#
# Usage:
#   RAILWAY_TOKEN=<project-token> \
#   SERVICE_ID=<service-id> \
#   ENVIRONMENT_ID=<env-id> \
#   bash scripts/deploy.sh
# ---------------------------------------------------------------------------
set -euo pipefail

: "${RAILWAY_TOKEN:?set RAILWAY_TOKEN (project token)}"
: "${SERVICE_ID:?set SERVICE_ID}"
: "${ENVIRONMENT_ID:?set ENVIRONMENT_ID}"

SHA="$(git rev-parse HEAD)"
echo "Deploying commit ${SHA} ..."

RESP="$(curl -s --max-time 30 -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceInstanceDeployV2(serviceId: \\\"${SERVICE_ID}\\\", environmentId: \\\"${ENVIRONMENT_ID}\\\", commitSha: \\\"${SHA}\\\") }\"}")"

echo "${RESP}"
echo ""
echo "Track status:"
echo "  curl -s -X POST https://backboard.railway.com/graphql/v2 \\"
echo "    -H \"Authorization: Bearer \$RAILWAY_TOKEN\" -H \"Content-Type: application/json\" \\"
echo "    -d '{\"query\":\"query { deployments(first: 1, input: {serviceId: \\\"'\$SERVICE_ID'\\\", environmentId: \\\"'\$ENVIRONMENT_ID'\\\"}) { edges { node { id status meta } } } }\"}'"
