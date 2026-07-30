"use client";
import { useState } from "react";
import { UserPlus, Trash2, ShieldCheck, Clock, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrg,
  useListOrgMembers,
  useInviteOrgMember,
  useRemoveOrgMember,
  useUpdateOrgMemberRole,
  getListOrgMembersQueryKey,
  type OrgRole,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";

const riskStyles: Record<string, string> = {
  low: "bg-success/10 text-success border-success/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  high: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function AdminMembersPage() {
  const { data: org } = useGetOrg({ query: { retry: false } });
  const { data: members = [] } = useListOrgMembers();
  const queryClient = useQueryClient();
  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: getListOrgMembersQueryKey() });
  const inviteMemberMutation = useInviteOrgMember();
  const removeMemberMutation = useRemoveOrgMember();
  const setMemberRoleMutation = useUpdateOrgMemberRole();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("employee");
  const [query, setQuery] = useState("");

  const activeSeats = members.filter((m) => m.status === "active").length;

  const q = query.trim().toLowerCase();
  const visibleMembers = q
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q),
      )
    : members;

  const submitInvite = () => {
    if (!email.trim()) return;
    inviteMemberMutation.mutate(
      { data: { name, email, role } },
      {
        onSuccess: () => {
          invalidateMembers();
          toast({ title: "Invitation sent", description: `${email} was invited as ${role}.` });
        },
        onError: (err) =>
          toast({ title: "Couldn't invite member", description: err.message, variant: "destructive" }),
      },
    );
    setName("");
    setEmail("");
    setRole("employee");
  };

  const removeMember = (id: string) => removeMemberMutation.mutate({ id }, { onSuccess: invalidateMembers });
  const setMemberRole = (id: string, newRole: OrgRole) =>
    setMemberRoleMutation.mutate({ id, data: { role: newRole } }, { onSuccess: invalidateMembers });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold">Members</h2>
          <p className="text-sm text-muted-foreground font-medium">
            {activeSeats} of {org?.seatLimit ?? 0} seats used
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="rounded-lg font-semibold">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="inv-name" className="font-semibold">Name</Label>
                <Input id="inv-name" placeholder="Alex Rivera" value={name}
                  onChange={(e) => setName(e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-email" className="font-semibold">Email</Label>
                <Input id="inv-email" type="email" placeholder="alex@company.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" className="rounded-lg">Cancel</Button></DialogClose>
              <DialogClose asChild>
                <Button className="rounded-lg font-semibold" onClick={submitInvite}>Send invitation</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="search"
          placeholder="Search members by name, email, or role"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search members"
          className="rounded-lg pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <Card className="border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="pl-4">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground font-medium">
                    No members match &ldquo;{query}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
              {visibleMembers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0 text-sm">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={m.role} onValueChange={(v) => setMemberRole(m.id, v as OrgRole)}>
                      <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {m.status === "active" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                        <ShieldCheck className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" /> Invited
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {m.status === "active" ? `${m.accuracy}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`capitalize font-semibold ${riskStyles[m.riskLevel]}`}>
                      {m.riskLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {m.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            They&apos;ll lose access to your organization&apos;s training. This can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => { removeMember(m.id); toast({ title: `${m.name} removed` }); }}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
