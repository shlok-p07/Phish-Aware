// Assertions on the synthesized template. Run with `bun run test` in infra/.
// Named *.check.ts so the app's root `bun test` never picks these up.
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { PhishAwareStack } from "../lib/phishaware-stack";

const repoRoot = join(import.meta.dirname, "..", "..");

const synth = (extra: Record<string, unknown> = {}) => {
  const app = new App();
  const stack = new PhishAwareStack(app, "Test", {
    env: { region: "us-east-1" },
    repoRoot,
    ...extra,
  });
  return Template.fromStack(stack);
};

const template = synth();

test("one free-tier-sized instance with standard CPU credits", () => {
  template.resourceCountIs("AWS::EC2::Instance", 1);
  template.hasResourceProperties("AWS::EC2::Instance", {
    InstanceType: "t4g.small",
    CreditSpecification: { CPUCredits: "standard" },
  });
});

test("nothing with a large fixed monthly cost", () => {
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
  template.resourceCountIs("AWS::EC2::EIP", 1);
});

test("IMDSv2 only, with a hop limit that keeps containers off it", () => {
  template.hasResourceProperties("AWS::EC2::Instance", {
    MetadataOptions: { HttpTokens: "required", HttpPutResponseHopLimit: 1 },
  });
});

test("root volume is encrypted gp3 within the 30 GiB free tier", () => {
  template.hasResourceProperties("AWS::EC2::Instance", {
    BlockDeviceMappings: [
      { DeviceName: "/dev/xvda", Ebs: Match.objectLike({ VolumeType: "gp3", Encrypted: true, VolumeSize: 20 }) },
    ],
  });
});

test("no SSH: only 80/tcp, 443/tcp and 443/udp are open", () => {
  const groups = template.findResources("AWS::EC2::SecurityGroup");
  const ingress = Object.values(groups).flatMap(
    (g) => (g.Properties.SecurityGroupIngress ?? []) as Array<{ FromPort: number; IpProtocol: string }>,
  );
  const opened = ingress.map((r) => `${r.FromPort}/${r.IpProtocol}`).sort();
  assert.deepEqual(opened, ["443/tcp", "443/udp", "80/tcp"]);
});

test("the AMI resolves at launch, so new AMIs don't replace the instance", () => {
  template.hasResourceProperties("AWS::EC2::Instance", {
    ImageId: Match.stringLikeRegexp("^resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64$"),
  });
});

test("user data stays under EC2's 16 KB limit", () => {
  const [instance] = Object.values(template.findResources("AWS::EC2::Instance"));
  const size = JSON.stringify(instance.Properties.UserData).length;
  assert.ok(size < 16_000, `user data is ~${size} bytes`);
});

test("the deploy association re-runs when the images change", () => {
  template.hasResourceProperties("AWS::SSM::Association", {
    Name: "AWS-RunShellScript",
    Parameters: {
      commands: [
        Match.stringLikeRegexp("^# web=[0-9a-f]{64} ml=[0-9a-f]{64} "),
        Match.stringLikeRegexp("\\.bootstrapped"),
        "bash /opt/phishaware/deploy.sh",
      ],
      executionTimeout: ["1800"],
    },
  });
});

test("the budget is created only when an email is given", () => {
  template.resourceCountIs("AWS::Budgets::Budget", 0);
  const withBudget = synth({ budgetEmail: "alerts@example.com", monthlyBudgetUsd: 5 });
  withBudget.hasResourceProperties("AWS::Budgets::Budget", {
    Budget: Match.objectLike({ BudgetLimit: { Amount: 5, Unit: "USD" }, CostTypes: Match.objectLike({ IncludeCredit: false }) }),
  });
});

test("an x86 instance type switches the AMI to x86_64", () => {
  const x86 = synth({ instanceType: "t3.small" });
  x86.hasResourceProperties("AWS::EC2::Instance", {
    ImageId: Match.stringLikeRegexp("al2023-ami-kernel-default-x86_64$"),
  });
});

test("a bare domain gets a www redirect alias; a subdomain does not", () => {
  synth({ domain: "phish-aware.tech" }).hasResourceProperties("AWS::SSM::Parameter", {
    Name: "/phishaware/site-aliases",
    Value: "www.phish-aware.tech",
  });
  synth({ domain: "app.phish-aware.tech" }).hasResourceProperties("AWS::SSM::Parameter", {
    Name: "/phishaware/site-aliases",
    Value: "none",
  });
});
