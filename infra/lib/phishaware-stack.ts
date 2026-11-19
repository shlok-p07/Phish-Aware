import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CfnOutput,
  Fn,
  RemovalPolicy,
  Stack,
  Tags,
  Validations,
  type StackProps,
} from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

export interface PhishAwareStackProps extends StackProps {
  /** Repository root, which holds the Next.js Dockerfile and ml-service/. */
  readonly repoRoot: string;
  /**
   * Public hostname, e.g. "phishaware.example.com", with a DNS A record pointing
   * at the stack's PublicIp output. Without one the site is served at
   * <ip-with-dashes>.sslip.io, which is fine for a first look but shares one
   * Let's Encrypt quota with every other sslip.io user and can fail to get a
   * certificate.
   */
  readonly domain?: string;
  /** Defaults to t4g.small: free-tier eligible, 2 vCPU / 2 GiB, Graviton. */
  readonly instanceType?: string;
  /** Email for the monthly cost budget alerts. No budget is created without it. */
  readonly budgetEmail?: string;
  readonly monthlyBudgetUsd?: number;
}

/** SSM parameter namespace the host reads its configuration from. */
export const PARAM_PREFIX = "/phishaware";

const hostFile = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "host", name), "utf8");

/**
 * The whole PhishAware stack -- Caddy (TLS), the Next.js app and the FastAPI
 * ML service -- as Docker Compose on a single EC2 instance.
 *
 * Sized to stay inside student credits / the free tier: one burstable instance
 * in standard credit mode, a public subnet with no NAT gateway or load
 * balancer, one Elastic IP, a 20 GiB gp3 volume, and SSM instead of SSH.
 * MongoDB stays on Atlas.
 */
export class PhishAwareStack extends Stack {
  constructor(scope: Construct, id: string, props: PhishAwareStackProps) {
    super(scope, id, props);
    Tags.of(this).add("Project", "PhishAware");

    const instanceType = new ec2.InstanceType(props.instanceType ?? "t4g.small");
    const arm = instanceType.architecture === ec2.InstanceArchitecture.ARM_64;
    const platform = arm ? Platform.LINUX_ARM64 : Platform.LINUX_AMD64;

    // --- Images: built locally by `cdk deploy`, pushed to the bootstrap ECR repo.
    const webImage = new DockerImageAsset(this, "WebImage", {
      directory: props.repoRoot,
      platform,
      // Not part of the Next.js build context, so editing them doesn't rebuild it.
      // Repo housekeeping files are excluded too, so editing them doesn't
      // change the image hash and trigger a redeploy.
      exclude: [
        "ml-service", "infra", "poster", ".claude", ".github",
        "*.md", "**/*.md", ".gitignore", ".editorconfig", "vercel.json",
        "docker-compose.yml", "scripts/dev.sh",
      ],
      // Baked into robots.txt, the sitemap and metadata at build time. Only a
      // real domain is known before deploy; the sslip.io fallback is set at
      // runtime by deploy.sh instead.
      buildArgs: props.domain
        ? { NEXT_PUBLIC_SITE_URL: `https://${props.domain}` }
        : undefined,
    });
    const mlImage = new DockerImageAsset(this, "MlImage", {
      directory: join(props.repoRoot, "ml-service"),
      platform,
    });

    // --- Network: public subnet only. A NAT gateway would cost more than the instance.
    // The AZ is pinned rather than looked up, so synth doesn't depend on a
    // cdk.context.json (which would publish the account ID) and a fresh clone
    // can't pick a different AZ and replace the subnet and instance.
    const vpc = new ec2.Vpc(this, "Vpc", {
      availabilityZones: [`${this.region}a`],
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });

    const sg = new ec2.SecurityGroup(this, "WebSg", {
      vpc,
      description: "PhishAware: HTTP/HTTPS in; no SSH (use Session Manager)",
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP (ACME challenge + redirect)");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(443), "HTTP/3");

    // --- Model artifact: not in git or the image, so the host syncs it from here.
    const modelBucket = new s3.Bucket(this, "ModelBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // It holds a copy of a file the team already has; `cdk destroy` should
      // leave nothing behind that keeps billing.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- Elastic IP: keeps the address (and the DNS record) stable across
    // --- instance replacements.
    const eip = new ec2.CfnEIP(this, "Eip", { domain: "vpc" });
    const siteAddress =
      props.domain ?? Fn.join("", [Fn.join("-", Fn.split(".", eip.attrPublicIp)), ".sslip.io"]);

    // --- Configuration the host reads on every deploy. web-env (the app's
    // --- secrets) is a SecureString that scripts/push-env.sh creates, because
    // --- CloudFormation cannot create SecureString parameters.
    const webImageParam = new ssm.StringParameter(this, "WebImageParam", {
      parameterName: `${PARAM_PREFIX}/web-image`,
      stringValue: webImage.imageUri,
    });
    const mlImageParam = new ssm.StringParameter(this, "MlImageParam", {
      parameterName: `${PARAM_PREFIX}/ml-image`,
      stringValue: mlImage.imageUri,
    });
    const siteParam = new ssm.StringParameter(this, "SiteAddressParam", {
      parameterName: `${PARAM_PREFIX}/site-address`,
      stringValue: siteAddress,
    });
    // A bare domain also answers on www.<domain>, redirecting to the bare one so
    // sessions and SSO callbacks stay on a single origin.
    const siteAliases =
      props.domain && props.domain.split(".").length === 2 ? `www.${props.domain}` : "none";
    const aliasesParam = new ssm.StringParameter(this, "SiteAliasesParam", {
      parameterName: `${PARAM_PREFIX}/site-aliases`,
      stringValue: siteAliases,
    });

    // --- Instance role: SSM (Session Manager + Run Command), image pull,
    // --- model read, and its own parameters. Nothing else.
    const role = new iam.Role(this, "HostRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "PhishAware EC2 host",
    });
    webImage.repository.grantPull(role);
    mlImage.repository.grantPull(role);
    modelBucket.grantRead(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          this.formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: `${PARAM_PREFIX.slice(1)}/*`,
          }),
        ],
      }),
    );

    // --- First boot: drop the host files in place, then run bootstrap.sh.
    const userData = ec2.UserData.forLinux();
    const files: Record<string, string> = {
      "compose.yaml": hostFile("compose.yaml"),
      "deploy.sh": hostFile("deploy.sh"),
      "host.env": [
        `REGION=${this.region}`,
        `PARAM_PREFIX=${PARAM_PREFIX}`,
        `MODEL_BUCKET=${modelBucket.bucketName}`,
        "",
      ].join("\n"),
    };
    userData.addCommands("set -euo pipefail", "mkdir -p /opt/phishaware");
    for (const [name, content] of Object.entries(files)) {
      // Base64 sidesteps quoting; CloudFormation still substitutes the tokens
      // in host.env because they are outside the encoded payloads.
      const encoded = content.includes("${Token")
        ? null
        : Buffer.from(content).toString("base64");
      userData.addCommands(
        encoded
          ? `echo '${encoded}' | base64 -d > /opt/phishaware/${name}`
          : `cat > /opt/phishaware/${name} <<'EOF'\n${content}EOF`,
      );
    }
    userData.addCommands(hostFile("bootstrap.sh"));

    const instance = new ec2.Instance(this, "Host", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType,
      // Resolved by EC2 at launch, so a newer AMI never silently replaces the
      // running instance on an unrelated deploy.
      machineImage: ec2.MachineImage.resolveSsmParameterAtLaunch(
        `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${arm ? "arm64" : "x86_64"}`,
        { os: ec2.OperatingSystemType.LINUX },
      ),
      securityGroup: sg,
      role,
      ssmSessionPermissions: true,
      userData,
      // Host-file changes take effect by replacing the instance; the Elastic IP
      // moves over. Image changes do not replace it (see the association below).
      userDataCausesReplacement: true,
      // Standard mode throttles at baseline instead of billing surplus credits,
      // which would draw on student credits silently.
      creditSpecification: ec2.CpuCredits.STANDARD,
      // IMDSv2 only, and a hop limit of 1 so the containers cannot reach the
      // instance role's credentials. (AL2023 AMIs default the limit to 2.)
      httpTokens: ec2.HttpTokens.REQUIRED,
      httpPutResponseHopLimit: 1,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // "resolve:ssm:<name>" is an ImageId EC2 itself accepts at launch; the
    // validator only knows the ami-xxxxxxxx format.
    Validations.of(instance).acknowledge({
      id: "CloudFormation-Validate::E1152",
      reason: "resolve:ssm: ImageIds are resolved by EC2 at launch",
    });

    new ec2.CfnEIPAssociation(this, "EipAssociation", {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    // --- Redeploy on every `cdk deploy` that changes what runs. Updating an
    // --- association runs it immediately, and its command embeds the image
    // --- hashes and site address, so any change to them re-runs deploy.sh.
    const deployAssociation = new ssm.CfnAssociation(this, "DeployAssociation", {
      name: "AWS-RunShellScript",
      associationName: "phishaware-deploy",
      targets: [{ key: "InstanceIds", values: [instance.instanceId] }],
      parameters: {
        commands: [
          `# web=${webImage.assetHash} ml=${mlImage.assetHash} site=${props.domain ?? "sslip.io"} aliases=${siteAliases}`,
          // The association can fire before first boot has even written
          // deploy.sh; wait for setup, and don't rely on the execute bit.
          "for _ in $(seq 1 90); do [ -f /opt/phishaware/.bootstrapped ] && break; sleep 10; done",
          "bash /opt/phishaware/deploy.sh",
        ],
        executionTimeout: ["1800"],
      },
    });
    for (const param of [webImageParam, mlImageParam, siteParam, aliasesParam]) {
      deployAssociation.node.addDependency(param);
    }

    // --- A cost alarm on gross usage (credits not subtracted), so credit
    // --- burn is visible before the credits run out.
    if (props.budgetEmail) {
      const subscribers = [{ subscriptionType: "EMAIL", address: props.budgetEmail }];
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: "phishaware-monthly",
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: props.monthlyBudgetUsd ?? 10, unit: "USD" },
          costTypes: { includeCredit: false, includeRefund: false },
        },
        notificationsWithSubscribers: [
          {
            notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 50 },
            subscribers,
          },
          {
            notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 100 },
            subscribers,
          },
          {
            notification: { notificationType: "FORECASTED", comparisonOperator: "GREATER_THAN", threshold: 100 },
            subscribers,
          },
        ],
      });
    }

    new CfnOutput(this, "Url", { value: Fn.join("", ["https://", siteAddress]) });
    new CfnOutput(this, "PublicIp", {
      value: eip.attrPublicIp,
      description: "Point the domain's DNS A record here",
    });
    new CfnOutput(this, "InstanceId", { value: instance.instanceId });
    new CfnOutput(this, "SessionCommand", {
      value: Fn.join("", ["aws ssm start-session --target ", instance.instanceId]),
    });
    new CfnOutput(this, "DeployAssociationId", { value: deployAssociation.attrAssociationId });
    new CfnOutput(this, "ModelBucketName", { value: modelBucket.bucketName });
  }
}
