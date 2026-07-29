"use client";
import { useState } from "react";
import { ClipboardList, Plus, Trash2, CalendarDays, Users, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useOrgMembersQuery,
  useOrgTrainingQuery,
  useCreateTrainingMutation,
  useDeleteTrainingMutation,
} from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";

export default function AdminTrainingPage() {
  const { data: members = [] } = useOrgMembersQuery();
  const { data: assignments = [] } = useOrgTrainingQuery();
  const createTraining = useCreateTrainingMutation();
  const deleteTraining = useDeleteTrainingMutation();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("all");
  const [dueDate, setDueDate] = useState("");
  const [required, setRequired] = useState("10");

  const memberName = (id: string) =>
    id === "all" ? "Everyone" : members.find((m) => m.id === id)?.name ?? "Unknown";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    createTraining.mutate(
      { title: title.trim(), target, dueDate, requiredScenarios: Number(required) || 0 },
      {
        onSuccess: () =>
          toast({ title: "Training assigned", description: `"${title.trim()}" assigned to ${memberName(target)}.` }),
        onError: (err) => toast({ title: "Couldn't assign training", description: err.message, variant: "destructive" }),
      },
    );
    setTitle("");
    setTarget("all");
    setDueDate("");
    setRequired("10");
  };

  const removeAssignment = (id: string) => deleteTraining.mutate(id);

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
                    <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {memberName(a.target)}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Due {a.dueDate}</span>
                    <span className="inline-flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {a.requiredScenarios} scenarios</span>
                  </div>
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
        <CardHeader className="bg-muted/30 border-b pb-4">
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
