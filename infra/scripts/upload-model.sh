#!/bin/bash
# Uploads the awareness model artifact from ml-service/models_store/ to the stack's
# S3 bucket and redeploys so the ML service loads it.
#
#   infra/scripts/upload-model.sh
#
# The artifact and its metadata come from the team (see ml-service/README.md);
# they are gitignored and not part of the ML image.
set -euo pipefail

REGION=${AWS_REGION:-${CDK_DEFAULT_REGION:-us-east-1}}
STACK=${STACK:-PhishAware}
STORE="$(cd "$(dirname "$0")/../../ml-service/models_store" && pwd)"

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

if ! find "$STORE" -maxdepth 1 -type f ! -name .gitkeep | grep -q .; then
  echo "$STORE is empty. Put the model artifact and its metadata JSON there first." >&2
  exit 1
fi

bucket=$(output ModelBucketName)
aws s3 sync "$STORE/" "s3://$bucket/models_store/" --region "$REGION" \
  --exclude .gitkeep --delete
aws ssm start-associations-once --region "$REGION" --association-ids "$(output DeployAssociationId)"
echo "Uploaded to s3://$bucket/models_store/ and started a redeploy."
