# Security policy

PhishAware handles accounts, organisation data and single sign-on, so security
reports are welcome.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it
privately through GitHub: open this repository's **Security** tab and choose
**Report a vulnerability**.

Include what you found, the steps to reproduce it, and the impact you expect.
Please don't access other people's data, run denial-of-service tests, or test
against accounts you don't own.

## Scope

In scope:

- The application code in this repository: the Next.js app, the ML service and
  the infrastructure definitions.
- The deployed site at <https://phish-aware.tech>, within the limits above.

Not vulnerabilities:

- **The phishing content itself.** Every scenario is simulated training
  material. Its senders, links and credential prompts are not real and lead
  nowhere.
- On a development server, password-reset codes are shown on screen by design;
  production never returns them (see "Password reset" in the
  [README](README.md#password-reset)).
- Findings that need a compromised device or a malicious browser extension.

## Supported versions

Only the `main` branch and the deployed site get fixes.
