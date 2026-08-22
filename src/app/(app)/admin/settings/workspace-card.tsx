"use client";

import { useState } from "react";
import { Palette, Save, Siren } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateOrgSettings,
  getGetOrgQueryKey,
  getGetCurrentUserQueryKey,
  type Org,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { OrgLogo } from "@/components/org-brand";
import { PRACTICE_VECTORS, type PracticeVector } from "@/server/attackProfiles";

/**
 * Where an administrator makes the product look and behave like their own.
 *
 * Everything here is rendered to their employees, so the server validates each
 * field and rejects rather than coerces (see src/server/orgBranding.ts). This
 * form therefore does no sanitising of its own -- it sends what was typed and
 * surfaces the server's message verbatim, because a client that quietly
 * "corrects" input teaches an admin that a value was accepted when it was not.
 *
 * The channel list is driven off PRACTICE_VECTORS rather than a hand-written
 * one: a hand-maintained copy is how the marketing page ended up advertising
 * three of six vectors.
 */
const VECTOR_LABELS: Record<PracticeVector, string> = {
  email: "Email",
  sms: "SMS",
  voice: "Voice call",
  qr: "QR code",
  social: "Social DM",
  web: "Web page",
};

/** A short list of defensible starting points, so nobody has to invent a hex. */
const SUGGESTED_COLORS = ["#2563eb", "#0f766e", "#7c3aed", "#b91c1c", "#c2410c", "#1e293b"];

export function WorkspaceCard({ org }: { org: Org }) {
  const workspace = org.workspace;
  const queryClient = useQueryClient();
  const updateSettings = useUpdateOrgSettings();
  const { toast } = useToast();

  const [accentColor, setAccentColor] = useState(workspace?.branding?.accentColor ?? "");
  const [logoUrl, setLogoUrl] = useState(workspace?.branding?.logoUrl ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(
    workspace?.branding?.welcomeMessage ?? "",
  );
  const [channel, setChannel] = useState(workspace?.reporting?.channel ?? "");
  const [instructions, setInstructions] = useState(workspace?.reporting?.instructions ?? "");
  // Stored empty means "no restriction"; the form shows that as everything
  // ticked, which is what an admin means by it.
  const [vectors, setVectors] = useState<PracticeVector[]>(
    workspace?.practiceVectors?.length
      ? (workspace.practiceVectors as PracticeVector[])
      : [...PRACTICE_VECTORS],
  );

  const toggleVector = (vector: PracticeVector) =>
    setVectors((current) =>
      current.includes(vector) ? current.filter((v) => v !== vector) : [...current, vector],
    );

  const save = () => {
    updateSettings.mutate(
      {
        data: {
          branding: { accentColor, logoUrl, welcomeMessage },
          reporting: { channel, instructions },
          practiceVectors: vectors,
        },
      },
      {
        onSuccess: () => {
          // Both caches: the admin's own org view, and the current-user payload
          // that carries branding to every page of the shell.
          queryClient.invalidateQueries({ queryKey: getGetOrgQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          toast({ title: "Workspace updated", description: "Your team will see this next time they load the app." });
        },
        onError: (cause: unknown) => {
          toast({
            variant: "destructive",
            title: "Couldn't save",
            // The server's own wording: it knows precisely which field was
            // wrong and why.
            description:
              (cause as { response?: { data?: { error?: string } } })?.response?.data?.error ??
              "Something went wrong saving your workspace.",
          });
        },
      },
    );
  };

  // At least one channel has to stay selected, or there is nothing to practise.
  const noVectors = vectors.length === 0;

  return (
    <Card className="shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="h-5 w-5 text-primary" />
          Your workspace
        </CardTitle>
        <CardDescription>
          How PhishAware looks and behaves for everyone in {org.name}.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="accent-color">Accent colour</Label>
            <div className="flex items-center gap-2">
              <Input
                id="accent-color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#2563eb"
                spellCheck={false}
                className="font-mono"
              />
              {/* A live swatch, so the value is checked by eye before saving. */}
              <span
                aria-hidden="true"
                className="h-9 w-9 shrink-0 rounded-md border"
                style={
                  /^#[0-9a-f]{6}$/i.test(accentColor)
                    ? { backgroundColor: accentColor }
                    : undefined
                }
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {SUGGESTED_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setAccentColor(hex)}
                  aria-label={`Use ${hex}`}
                  className="h-6 w-6 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Six-digit hex. Leave empty to use the PhishAware blue.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo URL</Label>
            <div className="flex items-center gap-2">
              <Input
                id="logo-url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                spellCheck={false}
              />
              <OrgLogo logoUrl={logoUrl} orgName={org.name} className="h-9 w-9 shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground">
              Must be https. Shown beside your organisation name in the sidebar.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="welcome-message">Welcome note</Label>
          <textarea
            id="welcome-message"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder="A line from your security team, shown on everyone's home page."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            {welcomeMessage.length}/280. Plain text.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Siren className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Reporting a real phishing email
          </p>
          <p className="pa-measure text-xs text-muted-foreground">
            Shown to an employee right after they correctly spot a phishing scenario. Without it
            the product can only say &ldquo;tell your security team&rdquo;, which nobody acts on.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-channel">Where to send it</Label>
              <Input
                id="report-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="phishing@example.com"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                An email address, or an https link to your internal form.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-instructions">Anything else they should do</Label>
              <Input
                id="report-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Forward it as an attachment, then delete it."
                maxLength={400}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Channels to train on</Label>
          <p className="pa-measure text-xs text-muted-foreground">
            Turn off anything your team never encounters. Somebody who has never been issued a
            company phone reads an SMS scenario as irrelevant rather than as practice.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {PRACTICE_VECTORS.map((vector) => {
              const on = vectors.includes(vector);
              return (
                <button
                  key={vector}
                  type="button"
                  onClick={() => toggleVector(vector)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {VECTOR_LABELS[vector]}
                </button>
              );
            })}
          </div>
          {noVectors && (
            <p className="text-xs font-medium text-destructive">
              Pick at least one, or there is nothing for your team to practise.
            </p>
          )}
        </div>

        <Button
          onClick={save}
          disabled={updateSettings.isPending || noVectors}
          className="rounded-lg font-semibold"
        >
          <Save className="mr-2 h-4 w-4" />
          {updateSettings.isPending ? "Saving..." : "Save workspace"}
        </Button>
      </CardContent>
    </Card>
  );
}
