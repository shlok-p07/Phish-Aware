/**
 * Stand up a complete, testable SSO scenario against a real identity provider.
 *
 * Drives the app's own HTTP API rather than writing to Mongo directly, so
 * running this actually exercises the endpoints an admin would use. It:
 *
 *   1. creates (or reuses) a demo org with an admin account
 *   2. saves the SSO connection from your SSO_TEST_* env vars
 *   3. runs the six server-side preflight checks against the real provider
 *   4. enables SSO and issues a pending invitation
 *   5. prints the sign-in URL to open
 *
 * Everything except typing a password at the provider is automated -- that one
 * step is a browser interaction at someone else's domain and can't be scripted
 * from here.
 *
 *   bun run sso:demo                       # against http://localhost:3000
 *   bun run sso:demo -- --reset            # delete the demo org first
 */

const BASE = process.env.SSO_DEMO_BASE_URL ?? "http://localhost:3000";
const API = `${BASE}/api`;

const ISSUER = process.env.SSO_TEST_ISSUER;
const CLIENT_ID = process.env.SSO_TEST_CLIENT_ID;
const CLIENT_SECRET = process.env.SSO_TEST_CLIENT_SECRET;
const PROVIDER = process.env.SSO_TEST_PROVIDER ?? "auth0";
const EMPLOYEE = process.env.SSO_TEST_EMPLOYEE ?? "alice@acme.test";

const ORG_NAME = "SSO Demo Co";
const ADMIN_EMAIL = "sso-demo-admin@phishaware.local";
const ADMIN_PASSWORD = "demo-admin-passphrase-42";

const reset = process.argv.includes("--reset");

// The invited employee's domain is what routes a login to this connection.
const DOMAIN = EMPLOYEE.split("@")[1];

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Cookie jar just rich enough for the session cookie. */
const cookies = new Map<string, string>();

function cookieHeader(): string {
  return Array.from(cookies, ([k, v]) => `${k}=${v}`).join("; ");
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies.size ? { Cookie: cookieHeader() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair!.indexOf("=");
    if (idx > 0) cookies.set(pair!.slice(0, idx), pair!.slice(idx + 1));
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON (204s, redirects) */
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nPhishAware SSO demo setup  ->  ${BASE}\n${"-".repeat(52)}`);

  if (!ISSUER || !CLIENT_ID || !CLIENT_SECRET) {
    die(
      "Missing SSO_TEST_ISSUER / SSO_TEST_CLIENT_ID / SSO_TEST_CLIENT_SECRET in .env.\n" +
        "  See the 'Testing SSO with Auth0' section of the README.",
    );
  }

  // 0. Is the server up?
  try {
    const health = await api("GET", "/healthz");
    if (health.status !== 200) die(`${BASE} answered ${health.status}. Is \`bun run dev\` running?`);
  } catch {
    die(`Couldn't reach ${BASE}. Start the app with \`bun run dev\` first.`);
  }
  console.log("  server            up");

  // 1. Admin account -- sign up, or log in if it already exists.
  let signup = await api("POST", "/auth/signup", {
    name: "SSO Demo Admin",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (signup.status === 409) {
    signup = await api("POST", "/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    if (signup.status !== 200) {
      die(`An account for ${ADMIN_EMAIL} exists but the demo password doesn't match. Run with --reset.`);
    }
    console.log("  admin             reused existing account");
  } else if (signup.status === 201) {
    console.log("  admin             created");
  } else {
    die(`Couldn't create the admin account (${signup.status}): ${JSON.stringify(signup.data)}`);
  }

  // 2. Organization.
  if (reset) {
    const existing = await api("GET", "/org");
    if (existing.status === 200) {
      await api("DELETE", "/org/sso");
      await api("DELETE", "/org");
      console.log("  org               deleted (--reset)");
    }
  }
  let org = await api("GET", "/org");
  if (org.status === 404) {
    org = await api("POST", "/org", { name: ORG_NAME, ssoDomain: DOMAIN });
    if (org.status !== 201) {
      die(`Couldn't create the org (${org.status}): ${JSON.stringify(org.data)}`);
    }
    console.log(`  org               created "${ORG_NAME}"`);
  } else {
    console.log(`  org               reused "${org.data.name}"`);
  }

  // 3. Save the connection (disabled for now -- enable only after it passes).
  const save = await api("PUT", "/org/sso", {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    providerKind: PROVIDER,
    allowedDomains: [DOMAIN],
    requireVerifiedEmail: true,
    enabled: false,
  });
  if (save.status !== 200) {
    die(`Couldn't save the SSO connection (${save.status}): ${save.data?.error ?? JSON.stringify(save.data)}`);
  }
  console.log("  sso connection    saved");
  console.log(`  redirect uri      ${save.data.redirectUri}`);

  // 4. Preflight.
  const test = await api("POST", "/org/sso/test");
  if (test.status !== 200) {
    die(`Preflight failed to run (${test.status}): ${JSON.stringify(test.data)}`);
  }
  console.log("\n  Preflight checks");
  for (const c of test.data.checks) {
    const mark = c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "FAIL";
    console.log(`    [${mark}] ${c.label}`);
    if (c.status !== "pass") console.log(`           ${c.detail}`);
  }
  if (!test.data.ok) {
    die("Preflight failed. Fix the checks above, then re-run. Nothing was enabled.");
  }

  // 5. Enable.
  const enable = await api("PUT", "/org/sso", {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    providerKind: PROVIDER,
    allowedDomains: [DOMAIN],
    requireVerifiedEmail: true,
    enabled: true,
  });
  if (enable.status !== 200 || !enable.data.enabled) {
    die(`Couldn't enable SSO (${enable.status}): ${JSON.stringify(enable.data)}`);
  }
  console.log("\n  sso               ENABLED");

  // 6. Invitation -- SSO is invite-only, so without this the login is refused.
  const invite = await api("POST", "/org/members", { email: EMPLOYEE, role: "employee" });
  if (invite.status === 201) {
    console.log(`  invitation        created for ${EMPLOYEE}`);
  } else if (invite.status === 409) {
    console.log(`  invitation        ${EMPLOYEE} already invited or a member`);
  } else {
    die(`Couldn't invite ${EMPLOYEE} (${invite.status}): ${JSON.stringify(invite.data)}`);
  }

  // 7. Confirm discovery routes this domain to the connection.
  cookies.clear();
  const discover = await api("POST", "/auth/sso/discover", { email: EMPLOYEE });
  if (!discover.data?.ssoAvailable) {
    die(`Discovery doesn't route ${DOMAIN} to this org. Check the allowed domains.`);
  }
  console.log(`  discovery         ${DOMAIN} -> ${discover.data.orgName}`);

  console.log(`\n${"-".repeat(52)}\nReady. To finish the round trip:\n`);
  console.log(`  1. Open  ${BASE}/auth`);
  console.log(`  2. Click "Sign in with your company account"`);
  console.log(`  3. Enter ${EMPLOYEE}`);
  console.log(`  4. Authenticate at your provider\n`);
  console.log(`  You should land in the app as a member of "${ORG_NAME}".\n`);
  console.log(`  Admin console:  ${BASE}/admin`);
  console.log(`    email     ${ADMIN_EMAIL}`);
  console.log(`    password  ${ADMIN_PASSWORD}\n`);
  console.log(`  Negative tests worth trying:`);
  console.log(`    - an address at ${DOMAIN} with NO invitation  -> not_a_member`);
  console.log(`    - an address at any other domain             -> domain_not_allowed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
