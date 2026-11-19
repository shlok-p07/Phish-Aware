#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { PhishAwareStack } from "../lib/phishaware-stack";

const app = new App();

// Personal settings (e.g. budgetEmail) live in cdk.local.json, which is
// gitignored, so they persist across deploys without being committed.
const localPath = join(import.meta.dirname, "..", "cdk.local.json");
const local: Record<string, unknown> = existsSync(localPath)
  ? JSON.parse(readFileSync(localPath, "utf8"))
  : {};

// Order: `-c key=value`, then cdk.json's context, then cdk.local.json.
const ctx = (key: string): string | undefined => {
  const value = app.node.tryGetContext(key) ?? local[key];
  return value === undefined || value === "" ? undefined : String(value);
};

const budget = ctx("monthlyBudgetUsd");

new PhishAwareStack(app, "PhishAware", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  repoRoot: join(import.meta.dirname, "..", ".."),
  domain: ctx("domain"),
  instanceType: ctx("instanceType"),
  budgetEmail: ctx("budgetEmail"),
  monthlyBudgetUsd: budget === undefined ? undefined : Number(budget),
  description: "PhishAware: Next.js + ML service on one EC2 instance (Docker Compose)",
});
