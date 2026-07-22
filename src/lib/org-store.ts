"use client";
/**
 * Client-side organization store — a localStorage-backed prototype of the
 * org/admin data model. NO server, NO database: everything here lives in the
 * browser so the admin UI can be built and demoed before real multi-tenancy
 * lands. Swap this module for API calls when the backend exists.
 */
import { useSyncExternalStore, useCallback } from "react";

export type OrgRole = "admin" | "member";

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  status: "active" | "invited";
  /** ISO date string; null for members who haven't started training. */
  joinedAt: string | null;
  // Denormalized training stats for the analytics/members views.
  accuracy: number; // 0-100
  scenariosCompleted: number;
  lessonsCompleted: number;
  riskLevel: "low" | "medium" | "high";
}

export interface TrainingAssignment {
  id: string;
  title: string;
  /** Which cohort this targets — "all" or a specific member id. */
  target: "all" | string;
  dueDate: string; // ISO date
  requiredScenarios: number;
  createdAt: string; // ISO date
}

export interface OrgSettings {
  name: string;
  /** Email domain that auto-joins new signups (empty = invite-only). */
  ssoDomain: string;
  seatLimit: number;
}

export interface OrgState {
  /** Whether the current browser "belongs to" an org as an admin. */
  hasOrg: boolean;
  settings: OrgSettings;
  members: OrgMember[];
  assignments: TrainingAssignment[];
}

const STORAGE_KEY = "phishaware.org.v1";

// ---------------------------------------------------------------------------
// Seed data — a populated demo org so the admin screens never look empty.
// ---------------------------------------------------------------------------
function seedState(name = "Acme Corp", domain = "acme.com"): OrgState {
  const members: OrgMember[] = [
    { id: "m1", name: "Jordan Lee", email: "jordan@acme.com", role: "admin", status: "active", joinedAt: "2026-05-02", accuracy: 94, scenariosCompleted: 128, lessonsCompleted: 12, riskLevel: "low" },
    { id: "m2", name: "Priya Nair", email: "priya@acme.com", role: "member", status: "active", joinedAt: "2026-05-10", accuracy: 88, scenariosCompleted: 96, lessonsCompleted: 10, riskLevel: "low" },
    { id: "m3", name: "Marcus Webb", email: "marcus@acme.com", role: "member", status: "active", joinedAt: "2026-05-14", accuracy: 72, scenariosCompleted: 54, lessonsCompleted: 7, riskLevel: "medium" },
    { id: "m4", name: "Elena Sokolov", email: "elena@acme.com", role: "member", status: "active", joinedAt: "2026-06-01", accuracy: 61, scenariosCompleted: 38, lessonsCompleted: 5, riskLevel: "medium" },
    { id: "m5", name: "Tom Alvarez", email: "tom@acme.com", role: "member", status: "active", joinedAt: "2026-06-08", accuracy: 44, scenariosCompleted: 19, lessonsCompleted: 2, riskLevel: "high" },
    { id: "m6", name: "Dana Kim", email: "dana@contractor.io", role: "member", status: "invited", joinedAt: null, accuracy: 0, scenariosCompleted: 0, lessonsCompleted: 0, riskLevel: "high" },
  ];
  const assignments: TrainingAssignment[] = [
    { id: "a1", title: "Q3 Onboarding: Email & SMS basics", target: "all", dueDate: "2026-08-15", requiredScenarios: 20, createdAt: "2026-07-01" },
    { id: "a2", title: "High-risk refresher", target: "m5", dueDate: "2026-08-01", requiredScenarios: 15, createdAt: "2026-07-10" },
  ];
  return {
    hasOrg: true,
    settings: { name, ssoDomain: domain, seatLimit: 50 },
    members,
    assignments,
  };
}

function emptyState(): OrgState {
  return {
    hasOrg: false,
    settings: { name: "", ssoDomain: "", seatLimit: 50 },
    members: [],
    assignments: [],
  };
}

// ---------------------------------------------------------------------------
// Store internals
// ---------------------------------------------------------------------------
let memoryState: OrgState | null = null;
const listeners = new Set<() => void>();

function read(): OrgState {
  if (memoryState) return memoryState;
  if (typeof window === "undefined") {
    memoryState = emptyState();
    return memoryState;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    memoryState = raw ? (JSON.parse(raw) as OrgState) : emptyState();
  } catch {
    memoryState = emptyState();
  }
  return memoryState;
}

function write(next: OrgState) {
  memoryState = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / serialization errors in the prototype */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Stable ids without Math.random / Date.now churn in render.
let idCounter = 0;
function newId(prefix: string) {
  idCounter += 1;
  return `${prefix}${Date.now()}_${idCounter}`;
}

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------
export const orgStore = {
  getState: read,
  subscribe,

  createOrg(name: string, ssoDomain: string) {
    write(seedState(name.trim() || "Your Organization", ssoDomain.trim()));
  },

  resetOrg() {
    write(emptyState());
  },

  updateSettings(patch: Partial<OrgSettings>) {
    const s = read();
    write({ ...s, settings: { ...s.settings, ...patch } });
  },

  inviteMember(name: string, email: string, role: OrgRole) {
    const s = read();
    const member: OrgMember = {
      id: newId("m"),
      name: name.trim() || email.split("@")[0],
      email: email.trim(),
      role,
      status: "invited",
      joinedAt: null,
      accuracy: 0,
      scenariosCompleted: 0,
      lessonsCompleted: 0,
      riskLevel: "high",
    };
    write({ ...s, members: [...s.members, member] });
  },

  removeMember(id: string) {
    const s = read();
    write({ ...s, members: s.members.filter((m) => m.id !== id) });
  },

  setMemberRole(id: string, role: OrgRole) {
    const s = read();
    write({
      ...s,
      members: s.members.map((m) => (m.id === id ? { ...m, role } : m)),
    });
  },

  addAssignment(a: Omit<TrainingAssignment, "id" | "createdAt">, createdAt: string) {
    const s = read();
    const assignment: TrainingAssignment = { ...a, id: newId("a"), createdAt };
    write({ ...s, assignments: [assignment, ...s.assignments] });
  },

  removeAssignment(id: string) {
    const s = read();
    write({ ...s, assignments: s.assignments.filter((a) => a.id !== id) });
  },
};

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------
export function useOrg() {
  const state = useSyncExternalStore(subscribe, read, emptyState);
  return {
    ...state,
    createOrg: useCallback(orgStore.createOrg, []),
    resetOrg: useCallback(orgStore.resetOrg, []),
    updateSettings: useCallback(orgStore.updateSettings, []),
    inviteMember: useCallback(orgStore.inviteMember, []),
    removeMember: useCallback(orgStore.removeMember, []),
    setMemberRole: useCallback(orgStore.setMemberRole, []),
    addAssignment: useCallback(orgStore.addAssignment, []),
    removeAssignment: useCallback(orgStore.removeAssignment, []),
  };
}

// Derived analytics helper used by the analytics page.
export function computeAnalytics(members: OrgMember[]) {
  const active = members.filter((m) => m.status === "active");
  const n = active.length || 1;
  const avgAccuracy = Math.round(active.reduce((s, m) => s + m.accuracy, 0) / n);
  const totalScenarios = active.reduce((s, m) => s + m.scenariosCompleted, 0);
  const atRisk = active.filter((m) => m.riskLevel === "high").length;
  const completionRate = Math.round(
    (active.filter((m) => m.lessonsCompleted >= 10).length / n) * 100,
  );
  const riskBands = {
    low: active.filter((m) => m.riskLevel === "low").length,
    medium: active.filter((m) => m.riskLevel === "medium").length,
    high: active.filter((m) => m.riskLevel === "high").length,
  };
  return { avgAccuracy, totalScenarios, atRisk, completionRate, riskBands, activeCount: active.length };
}
