"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgQuery, useCreateOrgMutation } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";

export default function CreateOrgPage() {
  const { data: org } = useOrgQuery();
  const createOrg = useCreateOrgMutation();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createOrg.mutate(
      { name, ssoDomain: domain },
      {
        onSuccess: () => {
          toast({
            title: "Organization created",
            description: `You're now the admin of ${name.trim() || "your organization"}.`,
          });
          router.push("/admin");
        },
        onError: () => toast({ title: "Couldn't create organization", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="max-w-lg mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="bg-primary/10 text-primary p-3 rounded-lg mb-4">
          <Building2 className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-display font-bold">Create your organization</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Set up a workspace to manage your team&apos;s phishing training.
        </p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <CardTitle className="text-lg">Organization details</CardTitle>
          <CardDescription className="text-sm font-medium">
            {org
              ? "You already belong to an organization, so this won't go through."
              : "You'll become the admin and can invite your team afterward."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="org-name" className="font-semibold">Organization name</Label>
              <Input
                id="org-name"
                placeholder="Acme Corp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="py-6 rounded-lg"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-domain" className="font-semibold">
                Email domain <span className="text-muted-foreground font-medium">(optional)</span>
              </Label>
              <Input
                id="org-domain"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="py-6 rounded-lg"
              />
              <p className="text-xs text-muted-foreground font-medium">
                Employees who sign up with this domain join automatically. Leave blank to require invites.
              </p>
            </div>
            <Button type="submit" className="w-full py-6 rounded-lg font-semibold text-base group">
              Create organization
              <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
