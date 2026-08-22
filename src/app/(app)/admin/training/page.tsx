"use client";
import { useState } from "react";
import {
  ClipboardList,
  Plus,
  Trash2,
  CalendarDays,
  Users,
  Target,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrgMembers,
  useListOrgDepartments,
  type Vector,
  useListOrgTraining,
  useCreateOrgTraining,
  useDeleteOrgTraining,
  getListOrgTrainingQueryKey,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { PRACTICE_VECTORS } from "@/server/attackProfiles";
import { CUE_OPTIONS } from "@/server/cues";
import { describeFocus } from "@/server/trainingProgress";
import {
  describeTrainingTarget,
  encodeDepartmentTarget,
} from "@/lib/trainingTarget";
import { CampaignProgress } from "./campaign-progress";


export default function AdminTrainingPage() {
  const { data: members = [] } = useListOrgMembers();

  // Invitations show up in this list too, but an invitation has no user row to
  // assign a campaign to, so only active members make a department targetable.
  const { data: orgDepartments = [] } = useListOrgDepartments();
  const staffedDepartments = orgDepartments
    .map((d) => d.name)
    .filter((name) => members.some((m) => m.status === "active" && m.department === name));
  const { data: assignments = [] } = useListOrgTraining();
  const queryClient = useQueryClient();
  const invalidateTraining = () => queryClient.invalidateQueries({ queryKey: getListOrgTrainingQueryKey() });
  const createTraining = useCreateOrgTraining();
  const deleteTraining = useDeleteOrgTraining();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("all");
  const [dueDate, setDueDate] = useState("");
  const [required, setRequired] = useState("10");
  // What the campaign trains. All empty means "any practice counts", which is
  // what every campaign meant before this existed.
  const [focusVectors, setFocusVectors] = useState<Vector[]>([]);
  const [focusCues, setFocusCues] = useState<string[]>([]);
  const [minDifficulty, setMinDifficulty] = useState("1");

  function toggle<T extends string>(list: T[], set: (next: T[]) => void, value: T) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const describeTarget = (target: string) =>
    describeTrainingTarget(
      target,
      (id) => members.find((m) => m.id === id)?.name ?? null,
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    createTraining.mutate(
      {
        data: {
          title: title.trim(),
          target,
          dueDate,
          requiredScenarios: Number(required) || 0,
          // Null rather than an all-empty object: storing one would imply a
          // constraint that does not exist.
          focus:
            focusVectors.length > 0 || focusCues.length > 0 || Number(minDifficulty) > 1
              ? {
                  vectors: focusVectors,
                  cues: focusCues,
                  minDifficulty: Number(minDifficulty) || 1,
                }
              : null,
        },
      },
      {
        onSuccess: () => {
          invalidateTraining();
          toast({
            title: "Training assigned",
            description: `"${title.trim()}" assigned to ${describeTarget(target)}.`,
          });
        },
        onError: (err) =>
          toast({
            title: "Couldn't assign training",
            description: err.message,
            variant: "destructive",
          }),
      },
    );
    setTitle("");
    setTarget("all");
    setDueDate("");
    setRequired("10");
    setFocusVectors([]);
    setFocusCues([]);
    setMinDifficulty("1");
  };

  const removeAssignment = (id: string) => deleteTraining.mutate({ id }, { onSuccess: invalidateTraining });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
      {/* Active assignments */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-bold">Active assignments</h2>
        {assignments.length === 0 ? (
          <Card className="border shadow-sm">
            <CardContent className="py-10 text-center text-muted-foreground font-medium">
              No training assigned yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          assignments.map((a) => (
            <Card key={a.id} className="border shadow-sm">
              <CardContent className="pt-6 flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <p className="font-semibold text-foreground">{a.title}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-medium pl-1">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />{" "}
                      {describeTarget(a.target)}
                    </span>
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Due {a.dueDate}</span>
                    <span className="inline-flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" /> {a.requiredScenarios}{" "}
                      scenarios
                    </span>
                    {a.focus && (
                      <span className="inline-flex items-center gap-1 font-semibold text-primary">
                        <Filter className="w-3.5 h-3.5" /> {describeFocus(a.focus)}
                      </span>
                    )}
                  </div>
                  <CampaignProgress campaignId={a.id} />
                </div>
                <Button variant="ghost" size="icon"
                  className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                  onClick={() => { removeAssignment(a.id); toast({ title: "Assignment removed" }); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create form */}
      <Card className="border shadow-sm lg:sticky lg:top-6">
        <CardHeader variant="band">
          <CardTitle className="text-lg">New assignment</CardTitle>
          <CardDescription className="text-sm font-medium">
            Set a training target and deadline for your team.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="a-title" className="font-semibold">Title</Label>
              <Input id="a-title" placeholder="Q3 phishing refresher" value={title}
                onChange={(e) => setTitle(e.target.value)} className="rounded-lg" required />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Assign to</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {/* Only departments that actually have members, so the form
                      can't offer a target the server will reject as empty. */}
                  {staffedDepartments.map((d) => (
                    <SelectItem key={d} value={encodeDepartmentTarget(d)}>
                      {d} department
                    </SelectItem>
                  ))}
                  {members.filter((m) => m.status === "active").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="a-due" className="font-semibold">Due date</Label>
                <Input id="a-due" type="date" value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)} className="rounded-lg" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-req" className="font-semibold">Scenarios</Label>
                <Input id="a-req" type="number" min={1} value={required}
                  onChange={(e) => setRequired(e.target.value)} className="rounded-lg" />
              </div>
            </div>
            {/* What the campaign trains. Left alone it means "any practice
                counts", which is what every campaign meant before this existed --
                so an admin responding to an incident on finance invoices could
                only ask for five rounds of anything. */}
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
                What should they practice?
                <span className="ml-2 font-medium text-muted-foreground">
                  {focusVectors.length === 0 && focusCues.length === 0 && minDifficulty === "1"
                    ? "Any practice counts"
                    : "Narrowed"}
                </span>
              </summary>
              <div className="space-y-4 border-t px-4 py-4">
                <div className="space-y-2">
                  <Label className="font-semibold">Channels</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRACTICE_VECTORS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggle(focusVectors, setFocusVectors, v as Vector)}
                        aria-pressed={focusVectors.includes(v as Vector)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                          focusVectors.includes(v as Vector)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    None selected means every channel counts.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Red flags to drill</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CUE_OPTIONS.map((cue) => (
                      <button
                        key={cue.id}
                        type="button"
                        onClick={() => toggle(focusCues, setFocusCues, cue.id)}
                        aria-pressed={focusCues.includes(cue.id)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          focusCues.includes(cue.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {cue.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A scenario counts if it carries at least one of these.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="a-min" className="font-semibold">Minimum difficulty</Label>
                  <Select value={minDifficulty} onValueChange={setMinDifficulty}>
                    <SelectTrigger id="a-min" className="rounded-lg max-w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Any level</SelectItem>
                      <SelectItem value="2">Level 2 and above</SelectItem>
                      <SelectItem value="3">Level 3 and above</SelectItem>
                      <SelectItem value="4">Level 4 and above</SelectItem>
                      <SelectItem value="5">Level 5 only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Assigned members are served at least this level while the campaign is
                    open, so the requirement cannot be met on easier material.
                  </p>
                </div>
              </div>
            </details>


            <Button type="submit" className="w-full py-6 rounded-lg font-semibold">
              <Plus className="w-4 h-4 mr-1" />
              Assign training
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
