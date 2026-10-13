import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { personName, statusLabel, useStaff } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity log | NEXUS" },
      { name: "description", content: "Admin audit trail of who did what, who tasks went to, and when." },
      { property: "og:title", content: "Activity log | NEXUS" },
      { property: "og:description", content: "Admin audit trail of who did what, who tasks went to, and when." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

type Details = { from?: string; to?: string; assignee_id?: string | null; previous_assignee_id?: string | null };

function ActivityPage() {
  const { isAdmin } = useAuth();
  const { data: staff } = useStaff();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["activity-log"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("id, actor_id, event_type, summary, details, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isAdmin) {
    return (
      <AppShell title="Activity log">
        <p className="text-sm text-muted-foreground">Only admins can view the activity log.</p>
      </AppShell>
    );
  }

  function describe(type: string, d: Details) {
    switch (type) {
      case "task_created": return "created task";
      case "task_assigned":
        return `assigned task to ${personName(staff, d.assignee_id)}${d.previous_assignee_id ? ` (was ${personName(staff, d.previous_assignee_id)})` : ""}`;
      case "task_status_changed": return `moved task ${statusLabel(d.from ?? "")} → ${statusLabel(d.to ?? "")}`;
      case "comment_added": return "commented";
      case "project_created": return "created project";
      case "project_status_changed": return `changed project status ${d.from} → ${d.to}`;
      default: return type.replaceAll("_", " ");
    }
  }

  return (
    <AppShell title="Activity log" description="Every change recorded by the system — newest first.">
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead className="w-44">Who</TableHead>
                  <TableHead>What</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm font-medium">{e.actor_id ? personName(staff, e.actor_id) : "System"}</TableCell>
                    <TableCell className="text-sm">
                      {describe(e.event_type, (e.details ?? {}) as Details)}
                      {e.summary && <span className="text-muted-foreground"> — {e.summary}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
