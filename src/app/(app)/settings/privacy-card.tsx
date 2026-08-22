"use client";
import { ShieldCheck, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useListMyConsents, useRecordMyConsent, getListMyConsentsQueryKey } from "@/api-client";
import { useToast } from "@/hooks/use-toast";

/**
 * What the product does with your data, and the one part of it you can turn off.
 *
 * The app was already storing a sixteen-field behavioural survey, a derived
 * awareness score and every judgement a person had made -- and showing an
 * aggregate to their employer -- with nowhere to see that, let alone decline any
 * of it.
 *
 * Persuasion profiling is genuinely optional and declining genuinely changes
 * behaviour: practice falls back to the department profile rather than inferring
 * which manipulations work on you personally. The required policy is shown as
 * required rather than as a switch that does nothing, because a disabled toggle
 * pretending to be a choice is worse than an honest sentence.
 */
export function PrivacyCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useListMyConsents();
  const record = useRecordMyConsent();

  const policies = data?.policies ?? [];
  if (policies.length === 0) {
    return null;
  }

  const set = (policy: "data_processing" | "emotional_profiling", granted: boolean) =>
    record.mutate(
      { data: { policy, granted } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyConsentsQueryKey() });
          toast({
            title: granted ? "Turned on" : "Turned off",
            description: granted
              ? "Practice will use your own history to choose tactics."
              : "Practice will use your department's profile instead.",
          });
        },
        onError: (err) =>
          toast({ title: "Couldn't save that", description: err.message, variant: "destructive" }),
      },
    );

  return (
    <Card className="border shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Your data
        </CardTitle>
        <CardDescription>
          What we keep, and what you can turn off. Changes take effect on your next
          round of practice.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-5">
        {policies.map((p) => (
          <div key={p.policy} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label
                  htmlFor={`consent-${p.policy}`}
                  className="font-semibold text-foreground"
                >
                  {p.title}
                </Label>
                <p className="pa-measure mt-1.5 text-sm text-muted-foreground">{p.body}</p>
              </div>
              {p.optional ? (
                <Switch
                  id={`consent-${p.policy}`}
                  checked={p.granted}
                  disabled={record.isPending}
                  onCheckedChange={(next) =>
                    set(p.policy as "emotional_profiling", next)
                  }
                  aria-label={p.title}
                />
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Required
                </span>
              )}
            </div>

            {/* An undecided optional policy is asked rather than assumed. Silence
                is not consent, so nothing is enabled until it is answered. */}
            {p.optional && p.needsDecision && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Not answered yet. It stays off until you choose.
                </p>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg font-semibold"
                    onClick={() => set(p.policy as "emotional_profiling", true)}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Allow
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-lg font-semibold"
                    onClick={() => set(p.policy as "emotional_profiling", false)}
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> No thanks
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
