#!/bin/bash
# Stores the app's environment file in SSM Parameter Store as a SecureString
# (standard tier: free, up to 4 KB) and redeploys so the host picks it up.
#
#   infra/scripts/push-env.sh .env.production
#
# Use a production file, not your local .env: ML_SERVICE_URL, APP_BASE_URL and
# NEXT_PUBLIC_SITE_URL are set by the host and ignored if present.
set -euo pipefail

ENV_FILE=${1:?usage: push-env.sh <env-file>}
REGION=${AWS_REGION:-${CDK_DEFAULT_REGION:-us-east-1}}
STACK=${STACK:-PhishAware}

[ -f "$ENV_FILE" ] || { echo "No such file: $ENV_FILE" >&2; exit 1; }
size=$(wc -c < "$ENV_FILE")
if [ "$size" -gt 4096 ]; then
  echo "$ENV_FILE is $size bytes; standard SSM parameters hold 4096. Drop comments and retry." >&2
  exit 1
fi
grep -q '^MONGODB_URI=' "$ENV_FILE" || echo "Warning: $ENV_FILE has no MONGODB_URI." >&2
grep -q '^APP_ENCRYPTION_KEY=' "$ENV_FILE" || echo "Warning: $ENV_FILE has no APP_ENCRYPTION_KEY." >&2

aws ssm put-parameter --region "$REGION" --name /phishaware/web-env \
  --type SecureString --tier Standard --overwrite \
  --value "file://$ENV_FILE" > /dev/null
echo "Stored $ENV_FILE in /phishaware/web-env."

association=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='DeployAssociationId'].OutputValue" --output text 2>/dev/null || true)
if [ -n "$association" ] && [ "$association" != "None" ]; then
  aws ssm start-associations-once --region "$REGION" --association-ids "$association"
  echo "Redeploy started. Follow it with: aws ssm list-commands --region $REGION --max-items 1"
else
  echo "Stack $STACK is not deployed yet; the first deploy will use these values."
fi
