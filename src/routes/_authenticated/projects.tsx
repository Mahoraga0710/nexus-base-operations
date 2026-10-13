import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import {
  PRIORITIES,
  PROJECT_STATUSES,
  personName,
  priorityVariant,
  projectStatusLabel,
  useProjects,
  useStaff,
  type Priority,
  type ProjectRow,
  type ProjectStatus,
} from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects | NEXUS" },
      { name: "description", content: "Engineering projects with leads, status, priority and deadlines in NEXUS." },
      { property: "og:title", content: "Projects | NEXUS" },
      { property: "og:description", content: "Engineering projects with leads, status, priority and deadlines in NEXUS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

type Form = { name: string; description: string; status: ProjectStatus; priority: Priority; due_date: string; lead_id: string };
const empty: Form = { name: "", description: "", status: "planning", priority: "medium", due_date: "", lead_id: "" };

function ProjectsPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useProjects();
  const { data: staff } = useStaff();
  const { data: counts = {} } = useQuery({
    queryKey: ["task-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("project_id, status");
      if (error) throw error;
      const out: Record<string, { open: number; total: number }> = {};
      for (const t of data ?? []) {
        out[t.project_id] ??= { open: 0, total: 0 };
        out[t.project_id].total++;
        if (t.status !== "done") out[t.project_id].open++;
      }
      return out;
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);

  function startCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function startEdit(p: ProjectRow) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      status: p.status,
      priority: p.priority,
      due_date: p.due_date ?? "",
      lead_id: p.lead_id ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return toast.error("Project name is required");
    if (name.length > 120) return toast.error("Name must be 120 characters or fewer");
    setSaving(true);
    const payload = {
      name,
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      lead_id: form.lead_id || null,
    };
    const res = editing
      ? await supabase.from("projects").update(payload).eq("id", editing.id)
      : await supabase.from("projects").insert({ ...payload, created_by: user!.id });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Project updated" : "Project created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["projects"] });
  }

  async function remove(p: ProjectRow) {
    if (!confirm(`Delete "${p.name}" and all its tasks?`)) return;
    await supabase.from("tasks").delete().eq("project_id", p.id);
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    qc.invalidateQueries();
  }

  return (
    <AppShell title="Projects">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{projects.length} projects</p>
        <Button onClick={startCreate}>
          <Plus className="mr-1 size-4" /> New project
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <FolderKanban className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No projects yet. Create one to start adding tasks.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Open tasks</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link to="/tasks" search={{ project: p.id }} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.description && <p className="line-clamp-1 text-xs text-muted-foreground">{p.description}</p>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{projectStatusLabel(p.status)}</Badge></TableCell>
                    <TableCell><Badge variant={priorityVariant(p.priority)} className="capitalize">{p.priority}</Badge></TableCell>
                    <TableCell className="text-sm">{personName(staff, p.lead_id)}</TableCell>
                    <TableCell className="text-sm">{p.due_date ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {counts[p.id]?.open ?? 0} / {counts[p.id]?.total ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)} aria-label="Edit project">
                        <Pencil className="size-4" />
                      </Button>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" onClick={() => remove(p)} aria-label="Delete project">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea id="p-desc" value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                  <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Lead</Label>
                <Select value={form.lead_id || "none"} onValueChange={(v) => setForm({ ...form, lead_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lead</SelectItem>
                    {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-due">Deadline</Label>
                <Input id="p-due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
