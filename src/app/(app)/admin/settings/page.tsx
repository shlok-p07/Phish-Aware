"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Building2, Users, AlertTriangle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrg,
  useListOrgMembers,
  useUpdateOrgSettings,
  useDeleteOrg,
  getGetOrgQueryKey,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { SsoCard } from "./sso-card";

export default function AdminSettingsPage() {
  const { data: org } = useGetOrg({ query: { retry: false } });
  const { data: members = [] } = useListOrgMembers();
  const queryClient = useQueryClient();
  const updateSettingsMutation = useUpdateOrgSettings();
  const deleteOrgMutation = useDeleteOrg();
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = useState(org?.name ?? "");
  const [domain, setDomain] = useState(org?.ssoDomain ?? "");
  const [seats, setSeats] = useState(String(org?.seatLimit ?? 0));

  // Keep local form in sync if the query data changes underneath.
  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setDomain(org.ssoDomain);
    setSeats(String(org.seatLimit));
  }, [org]);

  const activeSeats = members.filter((m) => m.status === "active").length;

  const save = () => {
    updateSettingsMutation.mutate(
      { data: { name: name.trim(), ssoDomain: domain.trim(), seatLimit: Number(seats) || 0 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrgQueryKey() });
          toast({ title: "Settings saved" });
        },
        onError: (err) => toast({ title: "Couldn't save settings", description: err.message, variant: "destructive" }),
      },
    );
  };

  const resetOrg = () =>
    deleteOrgMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrgQueryKey() });
        toast({ title: "Organization deleted" });
        router.push("/dashboard");
      },
    });

  return (
    <div className="space-y-6">
      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <CardTitle className="text-lg">General</CardTitle>
          <CardDescription className="text-sm font-medium">
            Your organization&apos;s name and identity.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-name" className="font-semibold">Organization name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg max-w-md" />
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Email domain
          </CardTitle>
          <CardDescription className="text-sm font-medium">
            Your organization&apos;s primary domain, used for display. It does not grant
            access on its own — everyone needs an invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-domain" className="font-semibold">Email domain</Label>
            <Input id="s-domain" placeholder="acme.com" value={domain}
              onChange={(e) => setDomain(e.target.value)} className="rounded-lg max-w-md" />
          </div>
        </CardContent>
      </Card>

      <SsoCard />

      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Seats
          </CardTitle>
          <CardDescription className="text-sm font-medium">
            {activeSeats} seats in use.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-seats" className="font-semibold">Seat limit</Label>
            <Input id="s-seats" type="number" min={activeSeats} value={seats}
              onChange={(e) => setSeats(e.target.value)} className="rounded-lg max-w-40" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="rounded-lg font-semibold" onClick={save}>
          <Save className="w-4 h-4 mr-2" />
          Save changes
        </Button>
      </div>

      {/* Danger zone */}
      <Card className="border border-destructive/40 shadow-sm">
        <CardHeader className="bg-destructive/5 border-b border-destructive/20 pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Danger zone
          </CardTitle>
          <CardDescription className="text-sm font-medium">
            Delete this organization and all of its local data.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-destructive/5 border border-destructive/20 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Delete organization</p>
              <p className="text-xs text-muted-foreground font-medium">
                Removes the org, unassigns its members, and deletes its training assignments.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0 rounded-lg font-semibold">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete organization
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this organization?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes {org?.name} and all its members and assignments. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={resetOrg}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
