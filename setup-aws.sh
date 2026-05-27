#!/bin/bash
set -euo pipefail

REGION="us-east-1"
QUEUE_NAME="momir-print-queue"
POOL_NAME="momir-print-pool"
ROLE_NAME="momir-print-unauth-role"
POLICY_NAME="momir-print-send-policy"

echo "=== Creating SQS Queue: $QUEUE_NAME ==="
QUEUE_URL=$(aws sqs create-queue \
  --queue-name "$QUEUE_NAME" \
  --attributes '{"MessageRetentionPeriod":"300","VisibilityTimeout":"30"}' \
  --region "$REGION" \
  --query 'QueueUrl' --output text)
echo "Queue URL: $QUEUE_URL"

QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attribute-names QueueArn \
  --region "$REGION" \
  --query 'Attributes.QueueArn' --output text)
echo "Queue ARN: $QUEUE_ARN"

echo ""
echo "=== Creating Cognito Identity Pool: $POOL_NAME ==="
POOL_ID=$(aws cognito-identity create-identity-pool \
  --identity-pool-name "$POOL_NAME" \
  --allow-unauthenticated-identities \
  --region "$REGION" \
  --query 'IdentityPoolId' --output text)
echo "Identity Pool ID: $POOL_ID"

echo ""
echo "=== Creating IAM Role: $ROLE_NAME ==="
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "cognito-identity.amazonaws.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {"cognito-identity.amazonaws.com:aud": "$POOL_ID"},
      "ForAnyValue:StringLike": {"cognito-identity.amazonaws.com:amr": "unauthenticated"}
    }
  }]
}
EOF
)

ROLE_ARN=$(aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --query 'Role.Arn' --output text)
echo "Role ARN: $ROLE_ARN"

echo ""
echo "=== Attaching SQS send policy ==="
SEND_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sqs:SendMessage",
    "Resource": "$QUEUE_ARN"
  }]
}
EOF
)

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$SEND_POLICY"
echo "Policy attached."

echo ""
echo "=== Setting Identity Pool roles ==="
aws cognito-identity set-identity-pool-roles \
  --identity-pool-id "$POOL_ID" \
  --roles "unauthenticated=$ROLE_ARN" \
  --region "$REGION"
echo "Roles set."

echo ""
echo "=== Done! ==="
echo ""
echo "Add these to your app:"
echo "  REGION:           $REGION"
echo "  IDENTITY_POOL_ID: $POOL_ID"
echo "  QUEUE_URL:        $QUEUE_URL"
