import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, FolderKanban, ListChecks, AlertTriangle } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | NEXUS Operations" },
      { name: "description", content: "Live view of clients, projects, tasks and activity across your delivery teams." },
      { property: "og:title", content: "Dashboard | NEXUS Operations" },
      { property: "og:description", content: "Live view of clients, projects, tasks and activity across your delivery teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

type ActivityRow = {
  id: string;
  event_type: string;
  summary: string | null;
  created_at: string;
};

function DashboardPage() {
  const { profile, primaryRole, isStaff } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [clients, projects, tasks, overdue, activity] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .neq("status", "done")
          .lt("due_date", today),
        supabase
          .from("activity_events")
          .select("id, event_type, summary, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (activity.error) throw activity.error;
      return {
        clients: clients.count ?? 0,
        projects: projects.count ?? 0,
        openTasks: tasks.count ?? 0,
        overdue: overdue.count ?? 0,
        activity: (activity.data ?? []) as ActivityRow[],
      };
    },
  });

  const stats = [
    { label: isStaff ? "Clients" : "My company", value: data?.clients, icon: Building2 },
    { label: "Projects", value: data?.projects, icon: FolderKanban },
    { label: "Open tasks", value: data?.openTasks, icon: ListChecks },
    { label: "Overdue tasks", value: data?.overdue, icon: AlertTriangle },
  ];

  return (
    <AppShell
      title="Dashboard"
      description={`Signed in as ${profile?.full_name ?? "your account"}${primaryRole ? ` · ${primaryRole}` : ""}`}
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Your account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="text-sm font-medium">{profile?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="truncate text-sm font-medium">{profile?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
            <p className="text-sm font-medium capitalize">{primaryRole ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Account status</p>
            <p className="text-sm font-medium capitalize">{profile?.status ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Member since</p>
            <p className="text-sm font-medium">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="font-display text-3xl font-semibold tracking-tight">{stat.value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : (data?.activity.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has happened yet. Activity appears here as clients, projects and tasks are created.
            </p>
          ) : (
            <ul className="divide-y">
              {data!.activity.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-sm">
                    <span className="font-medium capitalize">{event.event_type.replaceAll("_", " ")}</span>
                    {event.summary ? ` — ${event.summary}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
