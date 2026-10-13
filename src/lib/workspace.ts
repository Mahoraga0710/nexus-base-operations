import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "In review" },
  { value: "done", label: "Done" },
];
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const statusLabel = (s: string) => TASK_STATUSES.find((x) => x.value === s)?.label ?? s;
export const projectStatusLabel = (s: string) => PROJECT_STATUSES.find((x) => x.value === s)?.label ?? s;

export const priorityVariant = (p: string): "destructive" | "default" | "secondary" | "outline" =>
  p === "urgent" ? "destructive" : p === "high" ? "default" : p === "medium" ? "secondary" : "outline";

export type Person = { id: string; full_name: string | null; email: string | null };

/** Approved staff (admin or employee) who can own work. */
export function useStaff() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role").in("role", ["admin", "employee"]),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      const ids = new Set((roles.data ?? []).map((r) => r.user_id));
      return (profiles.data ?? []).filter((p) => ids.has(p.id)) as Person[];
    },
  });
}

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  due_date: string | null;
  lead_id: string | null;
  created_at: string;
};

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, status, priority, due_date, lead_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });
}

export const personName = (people: Person[] | undefined, id: string | null | undefined) => {
  if (!id) return "Unassigned";
  const p = people?.find((x) => x.id === id);
  return p?.full_name || p?.email || "Unknown";
};

export const isOverdue = (due: string | null, status: string) =>
  !!due && status !== "done" && due < new Date().toISOString().slice(0, 10);
