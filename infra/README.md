# PhishAware on EC2

An AWS CDK (TypeScript) app that runs the whole PhishAware stack on a single
EC2 instance with Docker Compose:

```
Internet ──443/80──▶ Caddy (TLS, Let's Encrypt) ──▶ web (Next.js :3000) ──▶ ml (FastAPI :8001)
                                                         │
                                                         └──▶ MongoDB Atlas (unchanged)
```

It is sized to stay within student credits and the free tier: one instance,
no NAT gateway, no load balancer, no SSH.

## What it creates

| Resource | Why | Approx. on-demand cost (us-east-1) |
| --- | --- | --- |
| `t4g.small` instance (2 vCPU, 2 GiB, Graviton), CPU credits in **standard** mode | Runs all three containers. Standard mode throttles at baseline instead of billing surplus credits. | ~$12/mo; free-tier eligible |
| Elastic IP | Stable address for DNS across instance replacements | ~$3.65/mo (public IPv4 charge) |
| 20 GiB gp3 root volume, encrypted, plus 2 GiB swap | Images, logs, model | ~$1.60/mo; within the 30 GiB free tier |
| VPC with one public subnet | No NAT gateway (that alone would be ~$32/mo) | free |
| S3 bucket | Holds the awareness model artifact, which is not in git or the image | cents |
| ECR images (the CDK bootstrap repo) | Built on your machine by `cdk deploy` | $0.10/GB-month. Old versions pile up, see [Cleanup](#cleanup) |
| SSM parameters, a State Manager association, Session Manager | Configuration, redeploys, shell access | free |
| AWS Budget (only if you pass `budgetEmail`) | Emails at 50% and 100% of actual spend and 100% of forecast. Gross spend, with credits **not** subtracted, so you see credit burn. | free (first two budgets) |

That totals about **$18/month before free tier and credits**. Check in
Billing → Credits that your credits apply to EC2, and when they expire.

Security defaults: IMDSv2 required, with a hop limit of 1 so containers can't
reach the instance role. Only 80/443 are open. Access is through Session
Manager. The instance role can only pull its images, read its bucket and read
`/phishaware/*` parameters.

## Prerequisites

- An AWS CLI session: `aws login` (or `aws sso login`), and `aws sts get-caller-identity` works.
- Docker running locally. Images are built on your machine for arm64, which matches an Apple-silicon Mac natively.
- Bun (or npm) for the CDK dependencies.
- Ideally a domain. The Student Developer Pack includes a free one-year domain
  (Namecheap or Name.com). Without one the site is served at
  `<ip-with-dashes>.sslip.io`. That works for a quick look, but sslip.io shares
  a single Let's Encrypt rate limit with all its users, so the certificate can fail.

## First deploy

Run these from the repository root unless noted.

1. **Install and bootstrap**. Bootstrap is once per account and region:

   ```bash
   cd infra && bun install
   npx cdk bootstrap
   ```

2. **Set your settings.** Put the domain in [`cdk.json`](cdk.json) and your
   personal settings in `infra/cdk.local.json`, which is gitignored. Both are
   read on every deploy. Leaving `budgetEmail` out of a later deploy would
   delete the budget.

   ```json
   // cdk.json -> "context"
   { "instanceType": "t4g.small", "monthlyBudgetUsd": 10, "domain": "example.tech" }

   // cdk.local.json
   { "budgetEmail": "you@example.com" }
   ```

3. **Push the app's secrets.** Create `.env.production` from `.env.example`
   (it is gitignored) with the production `MONGODB_URI`, `APP_ENCRYPTION_KEY`,
   `GROQ_API_KEY`, and so on. The host sets `ML_SERVICE_URL`, `APP_BASE_URL`
   and `NEXT_PUBLIC_SITE_URL` itself.

   ```bash
   infra/scripts/push-env.sh .env.production
   ```

   This is stored as an SSM SecureString in the standard tier: free, up to 4 KB.

4. **Deploy.** This builds both images, pushes them, and creates everything:

   ```bash
   cd infra && npx cdk diff && npx cdk deploy
   ```

   The outputs include `PublicIp`, `Url` and `SessionCommand`.

5. **Point things at the new address:**
   - Create a DNS **A record** for your domain pointing to `PublicIp` (and, for a bare domain like `example.tech`, one for `www` too; it redirects to the bare domain). Caddy issues the certificates once DNS resolves.
   - In MongoDB Atlas → Network Access, allow `PublicIp`.
   - Add `<Url>/api/auth/sso/callback` as a redirect URI at any SSO provider you've linked.

6. **Upload the model** once you have the artifact and its metadata in
   `backend/models_store/` (see [backend/README.md](../backend/README.md)):

   ```bash
   infra/scripts/upload-model.sh
   ```

   Until then the ML service runs without it, and onboarding falls back to
   diagnostic-quiz accuracy.

## Day to day

| Task | How |
| --- | --- |
| Ship app or ML changes | `cd infra && npx cdk deploy`. New images make the State Manager association rerun `deploy.sh`, which pulls and restarts with seconds of downtime. The instance is not replaced. |
| Change secrets | `infra/scripts/push-env.sh .env.production`, which stores them and redeploys |
| Shell on the box | `aws ssm start-session --target <InstanceId>`, then `cd /opt/phishaware && sudo docker compose --env-file images.env logs -f web` |
| See the last deploy | `aws ssm list-commands --max-items 1`, or `/var/log/cloud-init-output.log` for first boot |
| Change `infra/host/*` (compose file, scripts) | `cdk deploy` **replaces the instance**. The Elastic IP moves over, but expect a few minutes of downtime and a fresh certificate. |
| Stop paying for compute temporarily | `aws ec2 stop-instances --instance-ids <InstanceId>`. The Elastic IP and volume still bill (~$5/mo). |

The daily Vercel cron that hits `/api/readyz` (it keeps the Atlas free tier
awake) runs as a systemd timer on the host instead.

## Cleanup

- Old image versions in the CDK asset repository: `npx cdk gc --unstable=gc`.
- Everything: `cd infra && npx cdk destroy`. This deletes the instance, IP,
  volume, bucket and its model copy, and parameters except `/phishaware/web-env`
  (created by the script; remove it with
  `aws ssm delete-parameter --name /phishaware/web-env`). The CDK bootstrap
  stack stays; delete `CDKToolkit` in CloudFormation if you're done with CDK.

## Limits of this setup

One instance means no high availability. If it fails, the site is down until
it is replaced. 2 GiB is the smallest size that fits the model. If the ML
container is OOM-killed (`docker compose ps` shows restarts), move to a bigger
instance with `instanceType`. Any x86 type works too: the stack picks the
matching AMI and image platform.

## Checks

```bash
cd infra
bun run typecheck
bun run test       # template assertions: cost guards, IMDS, no SSH, user-data size
npx cdk synth -q
```
