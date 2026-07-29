"use client";
/**
 * Hand-written React Query hooks for the /api/org/* admin endpoints.
 *
 * These aren't generated from src/api-spec/openapi.yaml yet -- the spec only
 * covers the consumer-facing routes so far. Once it's extended to cover
 * /api/org/*, these can be replaced by generated hooks like the rest of the
 * app's data layer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@/api-client/custom-fetch";

export interface Org {
  id: string;
  name: string;
  ssoDomain: string;
  seatLimit: number;
}

export type OrgRole = "admin" | "employee";

export interface OrgMember {
  id: string;
  name: string;
  email: string | null;
  role: OrgRole;
  status: "invited" | "active" | "disabled";
  joinedAt: string | null;
  accuracy: number;
  riskLevel: "low" | "medium" | "high";
}

export interface TrainingAssignment {
  id: string;
  title: string;
  target: string;
  dueDate: string | null;
  requiredScenarios: number;
  createdAt: string;
}

export interface OrgAnalytics {
  avgAccuracy: number;
  activeCount: number;
  atRisk: number;
  riskBands: { low: number; medium: number; high: number };
  participationRate: number;
  perMember: { name: string; accuracy: number; risk: "low" | "medium" | "high" }[];
}

const orgKeys = {
  org: ["org"] as const,
  members: ["org", "members"] as const,
  training: ["org", "training"] as const,
  analytics: ["org", "analytics"] as const,
};

export function useOrgQuery() {
  return useQuery({
    queryKey: orgKeys.org,
    queryFn: async () => {
      try {
        return await customFetch<Org>("/api/org");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useCreateOrgMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; ssoDomain: string }) =>
      customFetch<Org>("/api/org", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.org }),
  });
}

export function useUpdateOrgSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; ssoDomain?: string; seatLimit?: number }) =>
      customFetch<Org>("/api/org/settings", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.org }),
  });
}

export function useDeleteOrgMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => customFetch<void>("/api/org", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.org });
      queryClient.invalidateQueries({ queryKey: orgKeys.members });
      queryClient.invalidateQueries({ queryKey: orgKeys.training });
      queryClient.invalidateQueries({ queryKey: orgKeys.analytics });
    },
  });
}

export function useOrgMembersQuery() {
  return useQuery({
    queryKey: orgKeys.members,
    queryFn: () => customFetch<OrgMember[]>("/api/org/members"),
  });
}

export function useInviteMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; role: OrgRole }) =>
      customFetch<OrgMember>("/api/org/members", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members }),
  });
}

export function useUpdateMemberRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: OrgRole }) =>
      customFetch(`/api/org/members/${id}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members }),
  });
}

export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFetch<void>(`/api/org/members/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members }),
  });
}

export function useOrgTrainingQuery() {
  return useQuery({
    queryKey: orgKeys.training,
    queryFn: () => customFetch<TrainingAssignment[]>("/api/org/training"),
  });
}

export function useCreateTrainingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      target: string;
      dueDate: string;
      requiredScenarios: number;
    }) => customFetch<TrainingAssignment>("/api/org/training", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.training }),
  });
}

export function useDeleteTrainingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFetch<void>(`/api/org/training/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.training }),
  });
}

export function useOrgAnalyticsQuery() {
  return useQuery({
    queryKey: orgKeys.analytics,
    queryFn: () => customFetch<OrgAnalytics>("/api/org/analytics"),
  });
}
