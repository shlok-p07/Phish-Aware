"use client";
import { useEffect, useState } from "react";
import {
  KeyRound, Save, Copy, Check, PlayCircle, ExternalLink, AlertTriangle,
  CircleCheck, CircleAlert, CircleX, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrg,
  useGetOrgSsoConnection,
  useUpsertOrgSsoConnection,
  useTestOrgSsoConnection,
  useDeleteOrgSsoConnection,
  getGetOrgSsoConnectionQueryKey,
  getGetOrgQueryKey,
  type SsoProviderKind,
  type SsoTestCheck,
  type OrgSsoConnection,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";

const PROVIDER_LABELS: Record<SsoProviderKind, string> = {
  okta: "Okta",
  entra: "Microsoft Entra ID",
  google: "Google Workspace",
  auth0: "Auth0",
  generic: "Other (generic OIDC)",
};

const ISSUER_HINTS: Record<SsoProviderKind, string> = {
  okta: "https://your-org.okta.com",
  entra: "https://login.microsoftonline.com/<tenant-id>/v2.0",
  google: "https://accounts.google.com",
  auth0: "https://your-tenant.us.auth0.com/  (keep the trailing slash)",
  generic: "https://idp.example.com",
};

const CHECK_ICONS = {
  pass: <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />,
  warn: <CircleAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />,
  fail: <CircleX className="w-4 h-4 text-destructive shrink-0 mt-0.5" />,
};

function RedirectUri({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="rounded-lg font-mono text-xs" />
      <Button
        type="button" variant="outline" size="icon" className="shrink-0"
        aria-label="Copy redirect URI"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

export function SsoCard() {
  const { data: sso } = useGetOrgSsoConnection({ query: { retry: false } });

  /*
   * The form seeds its fields from the stored connection. Keying on those
   * fields remounts it when the connection changes underneath -- after a save,
   * or a refetch -- so the inputs re-initialise. Replaces copying the query
   * data into state from an effect, which cost an extra render per load.
   */
  const seedKey = sso
    ? `${sso.providerKind} ${sso.issuer} ${sso.clientId} ${sso.allowedDomains.join(",")} ${sso.requireVerifiedEmail} ${sso.enabled} ${sso.hasClientSecret}`
    : "unconfigured";

  return <SsoCardForm key={seedKey} sso={sso} />;
}

function SsoCardForm({ sso }: { sso: OrgSsoConnection | undefined }) {
  const { data: org } = useGetOrg({ query: { retry: false } });
  const queryClient = useQueryClient();
  const upsertMutation = useUpsertOrgSsoConnection();
  const testMutation = useTestOrgSsoConnection();
  const deleteMutation = useDeleteOrgSsoConnection();
  const { toast } = useToast();

  const [providerKind, setProviderKind] = useState<SsoProviderKind>(sso?.providerKind ?? "generic");
  const [issuer, setIssuer] = useState(sso?.issuer ?? "");
  const [clientId, setClientId] = useState(sso?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [replacingSecret, setReplacingSecret] = useState(sso ? !sso.hasClientSecret : false);
  const [domains, setDomains] = useState(sso?.allowedDomains.join(", ") ?? "");
  const [requireVerifiedEmail, setRequireVerifiedEmail] = useState(sso?.requireVerifiedEmail ?? true);
  const [enabled, setEnabled] = useState(sso?.enabled ?? false);
  const [checks, setChecks] = useState<SsoTestCheck[] | null>(null);

  // The callback bounces the admin back here after a "Test sign-in" round trip.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("sso_test");
    if (!result) return;
    toast(
      result === "ok"
        ? { title: "Test sign-in succeeded", description: "Your identity provider is wired up correctly." }
        : { title: "Test sign-in failed", description: `The provider returned: ${result}.`, variant: "destructive" },
    );
    window.history.replaceState({}, "", window.location.pathname);
  }, [toast]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetOrgSsoConnectionQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOrgQueryKey() });
  };

  if (sso && !sso.serverConfigured) {
    return (
      <Card className="border-destructive/40 shadow-sm">
        <CardHeader className="bg-destructive/5 border-b pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Single sign-on unavailable
          </CardTitle>
          <CardDescription className="text-sm font-medium">
            This server has no <code className="font-mono text-xs">APP_ENCRYPTION_KEY</code>, so
            identity-provider secrets can&apos;t be stored securely. Ask whoever operates this
            deployment to set one, then reload this page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const save = () =>
    upsertMutation.mutate(
      {
        data: {
          issuer: issuer.trim(),
          clientId: clientId.trim(),
          // Omitted entirely when unchanged -- the server keeps what's stored,
          // and the plaintext is never round-tripped to the browser.
          ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
          providerKind,
          allowedDomains: domains.split(",").map((d) => d.trim()).filter(Boolean),
          requireVerifiedEmail,
          enabled,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setClientSecret("");
          setReplacingSecret(false);
          toast({ title: "Single sign-on saved" });
        },
        onError: (err) =>
          toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
      },
    );

  const runTest = () =>
    testMutation.mutate(undefined, {
      onSuccess: (result) => {
        setChecks(result.checks);
        invalidate();
        toast(
          result.ok
            ? { title: "All checks passed" }
            : { title: "Some checks failed", description: "See the details below.", variant: "destructive" },
        );
      },
      onError: (err) =>
        toast({ title: "Couldn't run the test", description: err.message, variant: "destructive" }),
    });

  const canEnable = Boolean(sso?.lastTestOk) || enabled;

  return (
    <Card className="border shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="text-lg flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          Single sign-on (OIDC)
        </CardTitle>
        <CardDescription className="text-sm font-medium">
          Let your team sign in with your existing identity provider. People still need an
          invitation — SSO controls how they authenticate, not whether they have access.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-5">
        <div className="space-y-2">
          <Label className="font-semibold">Redirect URI</Label>
          <RedirectUri value={sso?.redirectUri ?? ""} />
          <p className="text-xs text-muted-foreground font-medium">
            Paste this into your provider&apos;s allowed redirect / callback URLs, exactly as
            shown. A mismatch here is the most common cause of a failed sign-in.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-semibold">Provider</Label>
            <Select value={providerKind} onValueChange={(v) => setProviderKind(v as SsoProviderKind)}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABELS) as SsoProviderKind[]).map((kind) => (
                  <SelectItem key={kind} value={kind}>{PROVIDER_LABELS[kind]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sso-domains" className="font-semibold">Allowed email domains</Label>
            <Input id="sso-domains" placeholder="acme.com, acme.co.uk" value={domains}
              onChange={(e) => setDomains(e.target.value)} className="rounded-lg" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sso-issuer" className="font-semibold">Issuer URL</Label>
          <Input id="sso-issuer" placeholder={ISSUER_HINTS[providerKind]} value={issuer}
            onChange={(e) => setIssuer(e.target.value)} className="rounded-lg font-mono text-sm" />
          <p className="text-xs text-muted-foreground font-medium">
            Must match the <code className="font-mono">issuer</code> your provider publishes,
            character for character — including any trailing slash.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sso-client-id" className="font-semibold">Client ID</Label>
            <Input id="sso-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="rounded-lg font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sso-client-secret" className="font-semibold">Client secret</Label>
            {sso?.hasClientSecret && !replacingSecret ? (
              <div className="flex gap-2">
                <Input readOnly value="••••••••••••" className="rounded-lg font-mono text-sm" />
                <Button type="button" variant="outline" className="shrink-0 rounded-lg"
                  onClick={() => setReplacingSecret(true)}>
                  Replace
                </Button>
              </div>
            ) : (
              <Input id="sso-client-secret" type="password" placeholder="Paste the secret"
                value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                className="rounded-lg font-mono text-sm" />
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="sso-verified" className="font-semibold">Require verified email</Label>
            <p className="text-xs text-muted-foreground font-medium">
              Reject sign-ins where your provider says the address isn&apos;t verified. Microsoft
              Entra doesn&apos;t send this signal at all; for it, the allowed-domain list stands in.
            </p>
          </div>
          <Switch id="sso-verified" checked={requireVerifiedEmail} onCheckedChange={setRequireVerifiedEmail} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="sso-enabled" className="font-semibold">Enable single sign-on</Label>
            <p className="text-xs text-muted-foreground font-medium">
              {canEnable
                ? "Your team can sign in with their company account."
                : "Run a successful connection test first."}
            </p>
          </div>
          <Switch id="sso-enabled" checked={enabled} disabled={!canEnable} onCheckedChange={setEnabled} />
        </div>

        {checks && (
          <div className="rounded-lg border divide-y">
            {checks.map((check) => (
              <div key={check.id} className="flex gap-2.5 p-3">
                {CHECK_ICONS[check.status]}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{check.label}</p>
                  <p className="text-xs text-muted-foreground break-words">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {sso?.lastTestAt && !checks && (
          <p className="text-xs text-muted-foreground font-medium">
            Last tested {new Date(sso.lastTestAt).toLocaleString()} —{" "}
            {sso.lastTestOk ? "passed" : `failed: ${sso.lastTestError}`}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={save} disabled={upsertMutation.isPending} className="rounded-lg font-semibold">
            <Save className="w-4 h-4 mr-2" />
            {upsertMutation.isPending ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={runTest} disabled={!sso?.configured || testMutation.isPending}
            className="rounded-lg font-semibold">
            <PlayCircle className="w-4 h-4 mr-2" />
            {testMutation.isPending ? "Testing..." : "Test connection"}
          </Button>
          {sso?.configured && org && (
            <Button variant="outline" asChild className="rounded-lg font-semibold">
              {/* A full navigation, not a fetch — the next hop is the IdP. */}
              <a href={`/api/auth/sso/start?orgId=${org.id}&test=1`}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Test sign-in
              </a>
            </Button>
          )}
          {sso?.configured && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="rounded-lg font-semibold text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this SSO connection?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Anyone who signs in through your provider will lose that route immediately.
                    Members without a password will need an invitation to set one.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() =>
                      deleteMutation.mutate(undefined, {
                        onSuccess: () => {
                          invalidate();
                          setChecks(null);
                          toast({ title: "SSO connection removed" });
                        },
                      })
                    }
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
