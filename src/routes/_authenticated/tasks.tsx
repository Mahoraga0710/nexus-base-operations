import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KanbanSquare, List, MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import {
  PRIORITIES,
  TASK_STATUSES,
  isOverdue,
  personName,
  priorityVariant,
  statusLabel,
  useProjects,
  useStaff,
  type Priority,
  type TaskStatus,
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

type Search = { project?: string; view?: "list" | "board"; mine?: boolean };

export const Route = createFileRoute("/_authenticated/tasks")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    project: typeof s.project === "string" ? s.project : undefined,
    view: s.view === "board" ? "board" : s.view === "list" ? "list" : undefined,
    mine: s.mine === true || s.mine === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tasks | NEXUS" },
      { name: "description", content: "Task list and Kanban board with owners, priorities and deadlines in NEXUS." },
      { property: "og:title", content: "Tasks | NEXUS" },
      { property: "og:description", content: "Task list and Kanban board with owners, priorities and deadlines in NEXUS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TasksPage,
});

export type TaskRow = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
};

const TASK_COLS = "id, project_id, parent_task_id, title, description, status, priority, assignee_id, due_date, position, created_by, created_at";

function TasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const view = search.view ?? "list";
  const { data: projects = [] } = useProjects();
  const { data: staff } = useStaff();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select(TASK_COLS).neq("status", "requested").order("position");
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });
  const { data: commentCounts = {} } = useQuery({
    queryKey: ["comment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("comments").select("task_id").not("task_id", "is", null);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const c of data ?? []) out[c.task_id!] = (out[c.task_id!] ?? 0) + 1;
      return out;
    },
  });

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.parent_task_id &&
          (!search.project || t.project_id === search.project) &&
          (!search.mine || t.assignee_id === user?.id),
      ),
    [tasks, search.project, search.mine, user?.id],
  );
  const subCount = (id: string) => {
    const subs = tasks.filter((t) => t.parent_task_id === id);
    return subs.length ? `${subs.filter((s) => s.status === "done").length}/${subs.length}` : null;
  };
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  const [createOpen, setCreateOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;

  async function setStatus(task: TaskRow, status: TaskStatus) {
    if (task.status === status) return;
    qc.setQueryData<TaskRow[]>(["tasks"], (old) => old?.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const { error } = await supabase.from("tasks").update({ status }).eq("id", task.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <AppShell title="Tasks">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={search.project ?? "all"}
          onValueChange={(v) => navigate({ search: (s) => ({ ...s, project: v === "all" ? undefined : v }) })}
        >
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={search.mine ? "default" : "outline"}
          onClick={() => navigate({ search: (s) => ({ ...s, mine: s.mine ? undefined : true }) })}
        >
          My tasks
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => navigate({ search: (s) => ({ ...s, view: "list" }) })}>
              <List className="mr-1 size-4" /> List
            </Button>
            <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} onClick={() => navigate({ search: (s) => ({ ...s, view: "board" }) })}>
              <KanbanSquare className="mr-1 size-4" /> Board
            </Button>
          </div>
          <Button onClick={() => (projects.length ? setCreateOpen(true) : toast.error("Create a project first"))}>
            <Plus className="mr-1 size-4" /> New task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : view === "list" ? (
        <Card>
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">No tasks here yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                    <TableHead>Deadline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenTaskId(t.id)}>
                      <TableCell className="font-medium">
                        {t.title}
                        <TaskMeta subs={subCount(t.id)} comments={commentCounts[t.id]} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{projectName(t.project_id)}</TableCell>
                      <TableCell className="text-sm">{personName(staff, t.assignee_id)}</TableCell>
                      <TableCell><Badge variant={priorityVariant(t.priority)} className="capitalize">{t.priority}</Badge></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={t.status} onValueChange={(v) => setStatus(t, v as TaskStatus)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={`text-sm ${isOverdue(t.due_date, t.status) ? "font-medium text-destructive" : ""}`}>
                        {t.due_date ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5">
          {TASK_STATUSES.map((col) => {
            const colTasks = visible.filter((t) => t.status === col.value);
            return (
              <div
                key={col.value}
                className="min-h-40 rounded-lg bg-muted/50 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const t = tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  if (t) setStatus(t, col.value);
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      onClick={() => setOpenTaskId(t.id)}
                      className="cursor-grab rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{projectName(t.project_id)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant={priorityVariant(t.priority)} className="capitalize">{t.priority}</Badge>
                        {t.due_date && (
                          <span className={`text-xs ${isOverdue(t.due_date, t.status) ? "text-destructive" : "text-muted-foreground"}`}>
                            {t.due_date}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{personName(staff, t.assignee_id)}</span>
                        <TaskMeta subs={subCount(t.id)} comments={commentCounts[t.id]} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultProjectId={search.project ?? projects[0]?.id}
      />
      {openTask && (
        <TaskDetailDialog
          task={openTask}
          subtasks={tasks.filter((t) => t.parent_task_id === openTask.id)}
          onClose={() => setOpenTaskId(null)}
          onOpenTask={setOpenTaskId}
        />
      )}
    </AppShell>
  );
}

function TaskMeta({ subs, comments }: { subs: string | null; comments?: number }) {
  if (!subs && !comments) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-2 text-xs font-normal text-muted-foreground">
      {subs && <span>☐ {subs}</span>}
      {comments ? (
        <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" />{comments}</span>
      ) : null}
    </span>
  );
}

function TaskFormDialog({
  open,
  onOpenChange,
  defaultProjectId,
  parent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProjectId?: string;
  parent?: TaskRow;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: projects = [] } = useProjects();
  const { data: staff } = useStaff();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  const pid = parent?.project_id ?? (projectId || defaultProjectId || "");

  async function save() {
    const t = title.trim();
    if (!t) return toast.error("Title is required");
    if (t.length > 200) return toast.error("Title must be 200 characters or fewer");
    if (!pid) return toast.error("Choose a project");
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: t,
      description: description.trim() || null,
      project_id: pid,
      parent_task_id: parent?.id ?? null,
      assignee_id: assignee || null,
      priority,
      status,
      due_date: due || null,
      created_by: user!.id,
      position: Date.now() % 2147483647,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(parent ? "Subtask added" : "Task created");
    setTitle(""); setDescription(""); setAssignee(""); setDue(""); setPriority("medium"); setStatus("todo");
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parent ? `New subtask of "${parent.title}"` : "New task"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!parent && (
              <div className="col-span-2 grid gap-1.5">
                <Label>Project</Label>
                <Select value={pid} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Owner</Label>
              <Select value={assignee || "none"} onValueChange={(v) => setAssignee(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-due">Deadline</Label>
              <Input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({
  task,
  subtasks,
  onClose,
  onOpenTask,
}: {
  task: TaskRow;
  subtasks: TaskRow[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: staff } = useStaff();
  const [subOpen, setSubOpen] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", task.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, author_id, body, created_at")
        .eq("task_id", task.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function update(patch: Partial<TaskRow>) {
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function post() {
    const text = body.trim();
    if (!text) return;
    if (text.length > 5000) return toast.error("Comment is too long");
    setPosting(true);
    const { error } = await supabase.from("comments").insert({ task_id: task.id, author_id: user!.id, body: text });
    setPosting(false);
    if (error) return toast.error(error.message);
    setBody("");
    qc.invalidateQueries({ queryKey: ["comments", task.id] });
    qc.invalidateQueries({ queryKey: ["comment-counts"] });
  }

  async function remove() {
    if (!confirm("Delete this task and its subtasks?")) return;
    await supabase.from("tasks").delete().eq("parent_task_id", task.id);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return toast.error(error.message);
    toast.success("Task deleted");
    onClose();
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const canDelete = isAdmin || task.created_by === user?.id;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">
            <input
              key={task.id + task.title}
              defaultValue={task.title}
              maxLength={200}
              className="w-full bg-transparent outline-none"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== task.title) update({ title: v });
              }}
            />
          </DialogTitle>
        </DialogHeader>
        {task.parent_task_id && (
          <Button variant="link" className="h-auto justify-start p-0 text-xs" onClick={() => onOpenTask(task.parent_task_id!)}>
            ← Back to parent task
          </Button>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={task.status} onValueChange={(v) => update({ status: v as TaskStatus })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Owner</Label>
            <Select value={task.assignee_id ?? "none"} onValueChange={(v) => update({ assignee_id: v === "none" ? null : v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={task.priority} onValueChange={(v) => update({ priority: v as Priority })}>
              <SelectTrigger className="h-8 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Deadline</Label>
            <Input
              type="date"
              className="h-8"
              value={task.due_date ?? ""}
              onChange={(e) => update({ due_date: e.target.value || null })}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea
            key={task.id}
            defaultValue={task.description ?? ""}
            maxLength={5000}
            placeholder="Add details…"
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== task.description) update({ description: v });
            }}
          />
        </div>

        {!task.parent_task_id && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Subtasks</p>
              <Button size="sm" variant="outline" onClick={() => setSubOpen(true)}>
                <Plus className="mr-1 size-3.5" /> Add subtask
              </Button>
            </div>
            {subtasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No subtasks.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={s.status === "done"}
                      aria-label={`Mark ${s.title} done`}
                      onChange={async (e) => {
                        const { error } = await supabase.from("tasks").update({ status: e.target.checked ? "done" : "todo" }).eq("id", s.id);
                        if (error) toast.error(error.message);
                        qc.invalidateQueries({ queryKey: ["tasks"] });
                      }}
                    />
                    <button className={`flex-1 text-left hover:underline ${s.status === "done" ? "text-muted-foreground line-through" : ""}`} onClick={() => onOpenTask(s.id)}>
                      {s.title}
                    </button>
                    <span className="text-xs text-muted-foreground">{personName(staff, s.assignee_id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">Comments</p>
          <ul className="mb-3 space-y-3">
            {comments.length === 0 && <li className="text-xs text-muted-foreground">No comments yet.</li>}
            {comments.map((c) => (
              <li key={c.id} className="rounded-md bg-muted/50 p-2.5">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{personName(staff, c.author_id)}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            ))}
          </ul>
          <Textarea value={body} maxLength={5000} placeholder="Write a comment…" onChange={(e) => setBody(e.target.value)} />
          <div className="mt-2 flex justify-between">
            {canDelete ? (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
                <Trash2 className="mr-1 size-4" /> Delete task
              </Button>
            ) : <span />}
            <Button size="sm" onClick={post} disabled={posting || !body.trim()}>Comment</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Status: {statusLabel(task.status)} · Created {new Date(task.created_at).toLocaleDateString()}</p>

        <TaskFormDialog open={subOpen} onOpenChange={setSubOpen} parent={task} />
      </DialogContent>
    </Dialog>
  );
}
