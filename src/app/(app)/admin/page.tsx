"use client";
import { useState } from "react";
import {
  UserPlus, Trash2, ShieldCheck, Clock, Search, X, Copy, Check, RefreshCw, Link2,
} from "lucide-react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrg,
  useListOrgMembers,
  useInviteOrgMember,
  useRemoveOrgMember,
  useUpdateOrgMemberRole,
  useRevokeOrgInvitation,
  useGetOrgInvitationLink,
  useResendOrgInvitation,
  getListOrgMembersQueryKey,
  type OrgRole,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";

const riskStyles: Record<string, string> = {
  low: "bg-success/10 text-success border-success/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  high: "bg-destructive/10 text-destructive border-destructive/30",
};

/** Read-only field with a copy button. The invite link is useless unless it's easy to copy. */
function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied over plain http on some browsers; the input
      // is selectable, so manual copy still works.
      toast({
        title: "Couldn't copy automatically",
        description: "Select the link and copy it manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex gap-2">
      <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="rounded-lg font-mono text-xs" />
      <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy invite link" className="shrink-0">
        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

export default function AdminMembersPage() {
  const { data: org } = useGetOrg({ query: { retry: false } });
  const { data: members = [] } = useListOrgMembers();
  const queryClient = useQueryClient();
  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: getListOrgMembersQueryKey() });
  const inviteMemberMutation = useInviteOrgMember();
  const removeMemberMutation = useRemoveOrgMember();
  const setMemberRoleMutation = useUpdateOrgMemberRole();
  const revokeInvitationMutation = useRevokeOrgInvitation();
  const invitationLinkMutation = useGetOrgInvitationLink();
  const resendInvitationMutation = useResendOrgInvitation();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("employee");
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Held open after a successful invite so the admin can copy the link. With
  // no mailer, this dialog is the only way the link ever reaches them.
  const [issuedLink, setIssuedLink] = useState<{ email: string; url: string } | null>(null);

  // Pending invitations occupy a seat too, otherwise an admin could invite
  // past the limit and only find out when people start accepting.
  const usedSeats = members.filter((m) => m.status !== "disabled").length;

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
        onSuccess: (result) => {
          invalidateMembers();
          setInviteOpen(false);
          setIssuedLink({ email: email.trim(), url: result.inviteUrl });
          setName("");
          setEmail("");
          setRole("employee");
        },
        onError: (err) =>
          toast({ title: "Couldn't invite member", description: err.message, variant: "destructive" }),
      },
    );
  };

  const removeMember = (id: string) => removeMemberMutation.mutate({ id }, { onSuccess: invalidateMembers });
  const revokeInvitation = (id: string) => revokeInvitationMutation.mutate({ id }, { onSuccess: invalidateMembers });
  const setMemberRole = (id: string, newRole: OrgRole) =>
    setMemberRoleMutation.mutate({ id, data: { role: newRole } }, { onSuccess: invalidateMembers });

  const copyExistingLink = (id: string, memberEmail: string | null) =>
    invitationLinkMutation.mutate(
      { id },
      {
        onSuccess: (result) => setIssuedLink({ email: memberEmail ?? "", url: result.url }),
        onError: (err) =>
          toast({ title: "Couldn't get the link", description: err.message, variant: "destructive" }),
      },
    );

  const resendInvitation = (id: string, memberEmail: string | null) =>
    resendInvitationMutation.mutate(
      { id },
      {
        onSuccess: (result) => {
          invalidateMembers();
          setIssuedLink({ email: memberEmail ?? "", url: result.url });
          toast({
            title: "New link generated",
            description: "The previous link no longer works.",
          });
        },
        onError: (err) =>
          toast({ title: "Couldn't regenerate the link", description: err.message, variant: "destructive" }),
      },
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold">Members</h2>
          <p className="text-sm text-muted-foreground font-medium">
            {org?.seatLimit ? `${usedSeats} of ${org.seatLimit} seats used` : `${usedSeats} members`}
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-lg font-semibold">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription>
                You&apos;ll get a link to send them. They can join with a password, or with
                your organization&apos;s single sign-on if it&apos;s enabled.
              </DialogDescription>
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
              <Button
                className="rounded-lg font-semibold"
                onClick={submitInvite}
                disabled={inviteMemberMutation.isPending || !email.trim()}
              >
                {inviteMemberMutation.isPending ? "Creating..." : "Create invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={issuedLink !== null} onOpenChange={(open) => !open && setIssuedLink(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send this link to {issuedLink?.email}</DialogTitle>
            <DialogDescription>
              Anyone with this link can join your organization as the invited person, so
              share it directly with them. It expires in 14 days, and you can revoke or
              regenerate it any time from the members list.
            </DialogDescription>
          </DialogHeader>
          {issuedLink && <CopyableLink url={issuedLink.url} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button className="rounded-lg font-semibold">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground font-medium">
                    {query ? <>No members match &ldquo;{query}&rdquo;.</> : "No members yet. Invite someone to get started."}
                  </TableCell>
                </TableRow>
              )}
              {visibleMembers.map((m) => {
                // `id` means a user id or an invitation id depending on kind, so
                // every per-row action has to branch before choosing an endpoint.
                const isInvitation = m.kind === "invitation";
                return (
                  <TableRow key={`${m.kind}-${m.id}`}>
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
                      {isInvitation ? (
                        <span className="text-xs font-semibold text-muted-foreground capitalize">
                          {m.role === "admin" ? "Admin" : "Member"}
                        </span>
                      ) : (
                        <Select value={m.role} onValueChange={(v) => setMemberRole(m.id, v as OrgRole)}>
                          <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                          <ShieldCheck className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : m.status === "disabled" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                          <X className="w-3.5 h-3.5" /> Disabled
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
                      <div className="flex items-center justify-end gap-0.5">
                        {isInvitation && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon"
                                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                                  aria-label={`Copy invite link for ${m.name}`}
                                  onClick={() => copyExistingLink(m.id, m.email)}
                                >
                                  <Link2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy invite link</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon"
                                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                                  aria-label={`Generate a new invite link for ${m.name}`}
                                  onClick={() => resendInvitation(m.id, m.email)}
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>New link (invalidates the old one)</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              className="text-muted-foreground hover:text-destructive h-8 w-8"
                              aria-label={isInvitation ? `Revoke invitation for ${m.name}` : `Remove ${m.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {isInvitation ? `Revoke the invitation for ${m.name}?` : `Remove ${m.name}?`}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {isInvitation
                                  ? "Their invite link will stop working immediately. You can always invite them again."
                                  : "They'll lose access to your organization's training. Their practice history is kept."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-white hover:bg-destructive/90"
                                onClick={() => {
                                  if (isInvitation) {
                                    revokeInvitation(m.id);
                                    toast({ title: `Invitation for ${m.name} revoked` });
                                  } else {
                                    removeMember(m.id);
                                    toast({ title: `${m.name} removed` });
                                  }
                                }}
                              >
                                {isInvitation ? "Revoke" : "Remove"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
