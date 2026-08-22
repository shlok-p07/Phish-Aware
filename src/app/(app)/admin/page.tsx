"use client";
import { useState } from "react";
import {
  UserPlus, Trash2, ShieldCheck, Clock, Search, X, Copy, Check, RefreshCw, Link2,
  KeyRound,
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
  useGetCurrentUser,
  useListOrgMembers,
  useInviteOrgMember,
  useRemoveOrgMember,
  useUpdateOrgMember,
  useRevokeOrgInvitation,
  useGetOrgInvitationLink,
  useIssueMemberResetCode,
  useListOrgDepartments,
  useResendOrgInvitation,
  getListOrgMembersQueryKey,
  type OrgRole,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { MemberDetailSheet } from "./member-detail-sheet";
// Departments come from the organization now, not a fixed list, so an admin sees
// exactly what they have configured.


// Radix Select can't hold an empty-string item value, so "no department
// pinned" needs a sentinel that isn't a real department name.
const UNSET_DEPARTMENT = "__unset__";

const riskStyles: Record<string, string> = {
  low: "bg-success/10 text-success border-success/30",
  medium: "bg-warning/10 text-warning border-warning/30",
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
        {copied ? (
          <Check className="w-4 h-4 text-success" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}

export default function AdminMembersPage() {
  const { data: org } = useGetOrg({ query: { retry: false } });
  const { data: currentUser } = useGetCurrentUser({ query: { retry: false } });
  const { data: members = [] } = useListOrgMembers();
  const adminCount = members.filter(
    (m) => m.kind !== "invitation" && m.role === "admin",
  ).length;
  const queryClient = useQueryClient();
  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: getListOrgMembersQueryKey() });
  const inviteMemberMutation = useInviteOrgMember();
  const removeMemberMutation = useRemoveOrgMember();
  const updateMemberMutation = useUpdateOrgMember();
  const revokeInvitationMutation = useRevokeOrgInvitation();
  const invitationLinkMutation = useGetOrgInvitationLink();
  const resetCodeMutation = useIssueMemberResetCode();
  const { data: departments = [] } = useListOrgDepartments();
  const resendInvitationMutation = useResendOrgInvitation();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("employee");
  // "" means leave it open -- the invitee is then asked on the intro survey.
  const [department, setDepartment] = useState<string>("");
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Held open after a successful invite so the admin can copy the link. With
  // no mailer, this dialog is the only way the link ever reaches them.
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [issuedResetCode, setIssuedResetCode] = useState<{
    email: string;
    code: string;
  } | null>(null);
  const [issuedLink, setIssuedLink] = useState<{
    email: string;
    url: string;
  } | null>(null);

  // Pending invitations occupy a seat too, otherwise an admin could invite
  // past the limit and only find out when people start accepting.

  // Server-side, and it counts pending invitations -- which hold a seat too, so
  // a count of active members alone read lower than the check that refuses the
  // next invite.
  const usedSeats = org?.seats.activeSeats ?? 0;
  const pendingSeats = org?.seats.pendingInvitations ?? 0;

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
      { data: { name, email, role, ...(department ? { department } : {}) } },
      {
        onSuccess: (result) => {
          invalidateMembers();
          setInviteOpen(false);
          setIssuedLink({ email: email.trim(), url: result.inviteUrl });
          setName("");
          setEmail("");
          setRole("employee");
          setDepartment("");
        },
        onError: (err) =>
          toast({
            title: "Couldn't invite member",
            description: err.message,
            variant: "destructive",
          }),
      },
    );
  };

  const removeMember = (id: string, name: string) =>
    removeMemberMutation.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateMembers();
          toast({ title: `${name} removed` });
        },
        onError: (err) =>
          toast({
            title: "Couldn't remove member",
            description: err.message,
            variant: "destructive",
          }),
      },
    );
  const revokeInvitation = (id: string, name: string) =>
    revokeInvitationMutation.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateMembers();
          toast({ title: `Invitation for ${name} revoked` });
        },
        onError: (err) =>
          toast({
            title: "Couldn't revoke invitation",
            description: err.message,
            variant: "destructive",
          }),
      },
    );
  const setMemberRole = (id: string, newRole: OrgRole) =>
    updateMemberMutation.mutate(
      { id, data: { role: newRole } },
      { onSuccess: invalidateMembers },
    );

  // Department drives which attack types a member is drilled on and which
  // colleagues they are benchmarked against, so it is the org's call, not the
  // employee's -- onboarding will not overwrite an assignment made here.
  const setMemberDepartment = (id: string, next: string | null) =>
    updateMemberMutation.mutate(
      { id, data: { department: next } },
      { onSuccess: invalidateMembers },
    );

  // The production path for a forgotten password: there is no mail delivery, so
  // the self-service route returns nothing there and an admin issues the code
  // and passes it on out of band.
  const issueResetCode = (id: string, memberEmail: string | null) =>
    resetCodeMutation.mutate(
      { id },
      {
        onSuccess: (result) =>
          setIssuedResetCode({ email: memberEmail ?? "", code: result.code }),
        onError: (err) =>
          toast({
            title: "Couldn't issue a reset code",
            description: err.message,
            variant: "destructive",
          }),
      },
    );

  const copyExistingLink = (id: string, memberEmail: string | null) =>
    invitationLinkMutation.mutate(
      { id },
      {
        onSuccess: (result) => setIssuedLink({ email: memberEmail ?? "", url: result.url }),
        onError: (err) =>
          toast({
            title: "Couldn't get the link",
            description: err.message,
            variant: "destructive",
          }),
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
          toast({
            title: "Couldn't regenerate the link",
            description: err.message,
            variant: "destructive",
          }),
      },
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold">Members</h2>
          <p className="text-sm text-muted-foreground font-medium">
            {org?.seatLimit
              ? `${usedSeats} of ${org.seatLimit} seats used`
              : `${usedSeats} members`}
            {pendingSeats > 0
              ? ` · ${pendingSeats} pending ${pendingSeats === 1 ? "invitation" : "invitations"}`
              : ""}
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
                You&apos;ll get a link to send them. They can join with a
                password, or with your organization&apos;s single sign-on if
                it&apos;s enabled.
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
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Department</Label>
                <Select
                  value={department === "" ? UNSET_DEPARTMENT : department}
                  onValueChange={(v) =>
                    setDepartment(
                      v === UNSET_DEPARTMENT ? "" : v,
                    )
                  }
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET_DEPARTMENT}>Let them choose</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs font-medium text-muted-foreground">
                  Set it here and they won&apos;t be asked on their intro survey.
                </p>
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

      <MemberDetailSheet
        memberId={openMemberId}
        onOpenChange={(open) => !open && setOpenMemberId(null)}
      />

      <Dialog
        open={issuedResetCode !== null}
        onOpenChange={(open) => !open && setIssuedResetCode(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reset code for {issuedResetCode?.email}</DialogTitle>
            <DialogDescription>
              Give this to them over a channel you trust -- in person, or a call
              you placed. It works once, expires in 15 minutes, and anyone
              holding it can set a new password on that account. Do not send it
              by email or chat.
            </DialogDescription>
          </DialogHeader>
          {issuedResetCode && (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-4 text-center text-2xl font-bold tracking-widest">
              {issuedResetCode.code}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button className="rounded-lg font-semibold">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issuedLink !== null} onOpenChange={(open) => !open && setIssuedLink(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send this link to {issuedLink?.email}</DialogTitle>
            <DialogDescription>
              Anyone with this link can join your organization as the invited
              person, so share it directly with them. It expires in 14 days, and
              you can revoke or regenerate it any time from the members list.
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
              {/* Seven columns don't fit a phone. Department, status and
                  accuracy drop out as the viewport narrows and reappear inline
                  under the member's name (see the md:hidden line below), so
                  nothing is actually lost -- it just restacks. */}
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="pl-4">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden lg:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Accuracy</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground font-medium">
                    {query ? (
                      <>No members match &ldquo;{query}&rdquo;.</>
                    ) : (
                      "No members yet. Invite someone to get started."
                    )}
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
                          {/* The name is the way in: a row action would compete with the
                              controls already in the row, and the name is what an admin
                              reaches for. An invitation has no history to show. */}
                          {isInvitation ? (
                            <p className="font-semibold text-foreground truncate">{m.name}</p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenMemberId(m.id)}
                              className="block max-w-full truncate rounded text-left font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {m.name}
                            </button>
                          )}
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          {/* Stand-in for the columns hidden at this width. */}
                          <p className="lg:hidden text-xs text-muted-foreground truncate mt-0.5">
                            <span className="md:hidden">
                              {m.status === "active" ? "Active" : m.status === "disabled" ? "Disabled" : "Invited"}
                              {" · "}
                            </span>
                            <span className="sm:hidden">
                              {m.status === "active" ? `${m.accuracy}% accuracy · ` : ""}
                            </span>
                            {m.department ?? (isInvitation ? "Their choice" : "No department")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isInvitation ? (
                        <span className="text-xs font-semibold text-muted-foreground capitalize">
                          {m.role === "admin" ? "Admin" : "Member"}
                        </span>
                      ) : m.role === "admin" && adminCount <= 1 && currentUser?.id === m.id ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Select value={m.role} disabled>
                                <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            You&apos;re the only admin -- promote someone else before stepping down.
                          </TooltipContent>
                        </Tooltip>
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
                    <TableCell className="hidden lg:table-cell">
                      {/* A pending invitation has no user row to update yet -- the invite
                          already carries the department, so it is read-only until accepted. */}
                      {isInvitation ? (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {m.department ?? "Their choice"}
                        </span>
                      ) : (
                        <Select
                          value={m.department ?? UNSET_DEPARTMENT}
                          onValueChange={(v) =>
                            setMemberDepartment(
                              m.id,
                              v === UNSET_DEPARTMENT ? null : v,
                            )
                          }
                        >
                          <SelectTrigger
                            className="h-8 w-36 rounded-lg text-xs"
                            aria-label={`Department for ${m.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNSET_DEPARTMENT}>
                              Not set
                            </SelectItem>
                            {departments.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
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
                    <TableCell className="hidden sm:table-cell text-right font-semibold tabular-nums">
                      {m.status === "active" ? `${m.accuracy}%` : "n/a"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize font-semibold ${riskStyles[m.riskLevel]}`}>
                        {m.riskLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {!isInvitation && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                                  aria-label={`Issue a password reset code for ${m.name}`}
                                  onClick={() => issueResetCode(m.id, m.email)}
                                >
                                  <KeyRound className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Issue a password reset code</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {isInvitation && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
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
                                  variant="ghost"
                                  size="icon"
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
                              variant="ghost"
                              size="icon"
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
                                    revokeInvitation(m.id, m.name);
                                  } else {
                                    removeMember(m.id, m.name);
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
