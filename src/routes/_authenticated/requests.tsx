import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Link2, Paperclip, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitClientRequest, resolveClientRequest } from "@/lib/requests.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Requests | NEXUS Operations" },
      {
        name: "description",
        content: "Clients submit task and project requests with reference links and files; staff review and accept them.",
      },
      { property: "og:title", content: "Requests | NEXUS Operations" },
      {
        property: "og:description",
        content: "Clients submit task and project requests with reference links and files; staff review and accept them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RequestsPage,
});

type RequestStatus = "submitted" | "accepted" | "declined" | "completed";
type Priority = "low" | "medium" | "high" | "urgent";

type RequestRow = {
  id: string;
  kind: "task" | "project";
  title: string;
  body: string;
  status: RequestStatus;
  priority: Priority;
  desired_date: string | null;
  resolution_note: string | null;
  created_at: string;
  client_id: string;
  project_id: string | null;
  created_task_id: string | null;
  created_project_id: string | null;
};

const statusVariant: Record<RequestStatus, "default" | "secondary" | "outline" | "destructive"> = {
  submitted: "secondary",
  accepted: "default",
  completed: "outline",
  declined: "destructive",
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function RequestsPage() {
  const { isStaff } = useAuth();
  return (
    <AppShell
      title="Requests"
      description={isStaff ? "Review what clients have asked for." : "Ask for a new task or a brand-new project."}
    >
      {isStaff ? <StaffQueue /> : <ClientRequests />}
    </AppShell>
  );
}

/* ---------------------------------- client --------------------------------- */

type LinkDraft = { url: string; label: string };

function ClientRequests() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const submit = useServerFn(submitClientRequest);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"task" | "project">("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [desiredDate, setDesiredDate] = useState("");
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const allowanceQuery = useQuery({
    queryKey: ["request-allowance"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_request_allowance");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["my-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const requestsQuery = useQuery({
    queryKey: ["client-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_requests")
        .select(
          "id, kind, title, body, status, priority, desired_date, resolution_note, created_at, client_id, project_id, created_task_id, created_project_id",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
  });

  const allowance = allowanceQuery.data;
  const used = allowance?.used_today ?? 0;
  const dailyLimit = allowance?.daily_limit ?? null;
  const atLimit = dailyLimit !== null && used >= dailyLimit;

  function reset() {
    setKind("task");
    setTitle("");
    setBody("");
    setProjectId("");
    setPriority("medium");
    setDesiredDate("");
    setLinks([]);
    setFiles([]);
    setToken(null);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await submit({
        data: {
          kind,
          title: title.trim(),
          body: body.trim(),
          projectId: kind === "task" ? projectId || null : null,
          priority,
          desiredDate: desiredDate || null,
          links: links
            .filter((l) => l.url.trim().length)
            .map((l) => ({ url: l.url.trim(), ...(l.label.trim() ? { label: l.label.trim() } : {}) })),
          ...(token ? { turnstileToken: token } : {}),
        },
      });

      // Upload reference files into the private request bucket, then record them.
      if (files.length && profile?.client_id && user) {
        for (const file of files) {
          const safeName = file.name.replace(/[^\w.\-]+/g, "_");
          const path = `${profile.client_id}/${result.id}/${crypto.randomUUID()}-${safeName}`;
          const { error: uploadError } = await supabase.storage.from("request-attachments").upload(path, file);
          if (uploadError) throw uploadError;
          const { error: rowError } = await supabase.from("files").insert({
            request_id: result.id,
            client_id: profile.client_id,
            uploader_id: user.id,
            file_name: file.name,
            storage_path: path,
            mime_type: file.type || null,
            size_bytes: file.size,
            is_internal: false,
          });
          if (rowError) throw rowError;
        }
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Request sent. Our team has been notified.");
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      queryClient.invalidateQueries({ queryKey: ["request-allowance"] });
    },
    onError: (error: Error) => {
      if (error.message.includes("LIMIT_REACHED")) {
        setLimitReached(true);
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: ["request-allowance"] });
        return;
      }
      toast.error(error.message);
    },
  });

  const canSubmit =
    title.trim().length >= 3 &&
    body.trim().length >= 10 &&
    (kind === "project" || projectId.length > 0) &&
    !mutation.isPending;

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_FILES);
    const oversized = next.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      toast.error(`${oversized.name} is larger than 20 MB.`);
      return;
    }
    setFiles(next);
  }

  if (!profile?.client_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your account is not linked to a company yet</CardTitle>
          <CardDescription>
            Requests belong to a client company. Ask your account manager to link your profile, then this page will let
            you send task and project requests.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Today&apos;s allowance</CardTitle>
            <CardDescription>
              {allowanceQuery.isLoading
                ? "Checking your plan…"
                : dailyLimit === null
                  ? `${allowance?.tier ?? "enterprise"} plan — unlimited requests`
                  : `${used} of ${dailyLimit} requests used on the ${allowance?.tier ?? "free"} plan`}
            </CardDescription>
          </div>
          <Button onClick={() => (atLimit ? setLimitReached(true) : setOpen(true))}>
            <Plus className="size-4" />
            New request
          </Button>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {requestsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !requestsQuery.data?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                You have not sent any requests yet. Everything you send appears here with its status.
              </p>
            </CardContent>
          </Card>
        ) : (
          requestsQuery.data.map((request) => <RequestCard key={request.id} request={request} />)
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>Tell us what you need. Our team reviews every request.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>What are you asking for?</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as "task" | "project")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">A task on an existing project</SelectItem>
                  <SelectItem value="project">A brand-new project</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {kind === "task" && (
              <div className="grid gap-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={projectsQuery.data?.length ? "Choose a project" : "No projects yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(projectsQuery.data ?? []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="request-title">Title</Label>
              <Input
                id="request-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short summary"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="request-body">Details</Label>
              <Textarea
                id="request-body"
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What should be done, and why?"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="request-date">Needed by (optional)</Label>
                <Input
                  id="request-date"
                  type="date"
                  value={desiredDate}
                  onChange={(event) => setDesiredDate(event.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Link2 className="size-4" /> Reference links
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
                >
                  Add link
                </Button>
              </div>
              {links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="https://…"
                    value={link.url}
                    onChange={(event) =>
                      setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, url: event.target.value } : l)))
                    }
                  />
                  <Input
                    className="w-32"
                    placeholder="Label"
                    value={link.label}
                    onChange={(event) =>
                      setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, label: event.target.value } : l)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Paperclip className="size-4" /> Reference files
              </Label>
              <Input type="file" multiple onChange={(event) => pickFiles(event.target.files)} />
              <p className="text-xs text-muted-foreground">Up to {MAX_FILES} files, 20 MB each.</p>
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between text-sm">
                  <span className="truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <TurnstileWidget action="client-request" onToken={setToken} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => (setOpen(false), reset())}>
              Cancel
            </Button>
            <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={limitReached} onOpenChange={setLimitReached}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              You have used today&apos;s requests
            </DialogTitle>
            <DialogDescription>
              Your company is on the {allowance?.tier ?? "free"} plan, which allows {dailyLimit ?? 5} requests per day.
              The allowance resets at midnight.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">Pro</p>
              <p className="text-muted-foreground">A much higher daily allowance for busier teams.</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">Enterprise</p>
              <p className="text-muted-foreground">Unlimited requests for your whole company.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Paid plans are not open for purchase yet. Talk to your account manager to be moved up early.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitReached(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestCard({ request, footer }: { request: RequestRow; footer?: React.ReactNode }) {
  const linksQuery = useQuery({
    queryKey: ["request-links", request.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_links")
        .select("id, url, label")
        .eq("request_id", request.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant[request.status]}>{request.status}</Badge>
          <Badge variant="outline">{request.kind === "project" ? "New project" : "Task"}</Badge>
          <Badge variant="outline">{request.priority}</Badge>
          <span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span>
        </div>
        <CardTitle className="text-base">{request.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="whitespace-pre-wrap text-muted-foreground">{request.body}</p>
        {request.desired_date && (
          <p className="text-xs text-muted-foreground">Needed by {formatDate(request.desired_date)}</p>
        )}
        {!!linksQuery.data?.length && (
          <ul className="space-y-1">
            {linksQuery.data.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  {link.label || link.url}
                </a>
              </li>
            ))}
          </ul>
        )}
        {request.resolution_note && (
          <p className="rounded-md border border-dashed p-2 text-muted-foreground">
            Note from the team: {request.resolution_note}
          </p>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- staff ---------------------------------- */

function StaffQueue() {
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveClientRequest);
  const [filter, setFilter] = useState<"submitted" | "all">("submitted");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const requestsQuery = useQuery({
    queryKey: ["staff-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_requests")
        .select(
          "id, kind, title, body, status, priority, desired_date, resolution_note, created_at, client_id, project_id, created_task_id, created_project_id",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
  });

  const clientsQuery = useQuery({
    queryKey: ["clients-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientNames = useMemo(
    () => Object.fromEntries((clientsQuery.data ?? []).map((c) => [c.id, c.name])),
    [clientsQuery.data],
  );

  const mutation = useMutation({
    mutationFn: async (input: { requestId: string; action: "accept" | "decline" | "complete" }) => {
      const note = notes[input.requestId]?.trim();
      return resolve({ data: { ...input, ...(note ? { note } : {}) } });
    },
    onSuccess: (_result, input) => {
      toast.success(`Request ${input.action === "accept" ? "accepted" : input.action + "d"}.`);
      setNotes((prev) => ({ ...prev, [input.requestId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visible = (requestsQuery.data ?? []).filter((r) => (filter === "all" ? true : r.status === "submitted"));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant={filter === "submitted" ? "default" : "outline"} size="sm" onClick={() => setFilter("submitted")}>
          Awaiting review
        </Button>
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
          All requests
        </Button>
      </div>

      {requestsQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !visible.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === "submitted" ? "Nothing is waiting for review." : "No client has sent a request yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        visible.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            footer={
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">From {clientNames[request.client_id] ?? "a client"}</p>
                {request.status === "submitted" || request.status === "accepted" ? (
                  <>
                    <Textarea
                      rows={2}
                      placeholder="Note back to the client (optional)"
                      value={notes[request.id] ?? ""}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      {request.status === "submitted" && (
                        <>
                          <Button
                            size="sm"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ requestId: request.id, action: "accept" })}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ requestId: request.id, action: "decline" })}
                          >
                            Decline
                          </Button>
                        </>
                      )}
                      {request.status === "accepted" && (
                        <Button
                          size="sm"
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate({ requestId: request.id, action: "complete" })}
                        >
                          Mark completed
                        </Button>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            }
          />
        ))
      )}
    </div>
  );
}
