"use client";
import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrgDepartments,
  useCreateOrgDepartment,
  useRenameOrgDepartment,
  useDeleteOrgDepartment,
  getListOrgDepartmentsQueryKey,
  getListOrgMembersQueryKey,
} from "@/api-client";
import { useToast } from "@/hooks/use-toast";

/**
 * Departments as the organization's own records.
 *
 * The product previously offered a fixed ten, so a customer whose structure did
 * not match them had nowhere to put people. A new organization still starts from
 * those ten -- they are what map to attack types, so keeping them means
 * department-targeted scenarios work with no setup -- and anything added beyond
 * them behaves the same everywhere a department is used.
 */
export function DepartmentsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: departments = [] } = useListOrgDepartments();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; memberCount: number } | null>(null);

  const createDepartment = useCreateOrgDepartment();
  const renameDepartment = useRenameOrgDepartment();
  const deleteDepartment = useDeleteOrgDepartment();

  // Members carry the department name, so anything that changes it has to
  // refresh the member list too or the table shows stale assignments.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListOrgDepartmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOrgMembersQueryKey() });
  };

  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createDepartment.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          setNewName("");
          invalidate();
          toast({ title: "Department added", description: `${name} is ready to assign.` });
        },
        onError: fail("Couldn't add that department"),
      },
    );
  };

  const submitRename = (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    renameDepartment.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
          toast({ title: "Department renamed", description: "Its members moved with it." });
        },
        onError: fail("Couldn't rename that department"),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    deleteDepartment.mutate(
      { id },
      {
        onSuccess: () => {
          setPendingDelete(null);
          invalidate();
          toast({
            title: "Department deleted",
            description: `Anyone in ${name} is now unassigned.`,
          });
        },
        onError: fail("Couldn't delete that department"),
      },
    );
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Departments
        </CardTitle>
        <CardDescription>
          Departments decide which attacks each person is drilled on, who they are
          benchmarked against, and who a training campaign can target.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-5">
        <ul className="divide-y rounded-lg border">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              {editingId === d.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-8 rounded-lg"
                    aria-label={`New name for ${d.name}`}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label="Save name"
                    onClick={() => submitRename(d.id)}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label="Cancel rename"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-semibold truncate">{d.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {d.memberCount} {d.memberCount === 1 ? "member" : "members"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Rename ${d.name}`}
                    onClick={() => {
                      setEditingId(d.id);
                      setEditingName(d.name);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${d.name}`}
                    onClick={() => setPendingDelete(d)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={submitNew} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-department" className="font-semibold">
              Add a department
            </Label>
            <Input
              id="new-department"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Claims Processing"
              className="rounded-lg"
            />
          </div>
          <Button
            type="submit"
            disabled={!newName.trim() || createDepartment.isPending}
            className="rounded-lg font-semibold"
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </form>
      </CardContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.memberCount
                ? `${pendingDelete.memberCount} ${pendingDelete.memberCount === 1 ? "person" : "people"} will become unassigned. Their accounts and history are kept, and you can file them somewhere else afterwards.`
                : "Nobody is in this department, so nothing else changes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-lg font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
