import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useAuth, type AppRole } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Team settings | NEXUS Operations" },
      { name: "description", content: "Admin controls for people and role assignments across the NEXUS workspace." },
      { property: "og:title", content: "Team settings | NEXUS Operations" },
      { property: "og:description", content: "Admin controls for people and role assignments across the NEXUS workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const ROLES: AppRole[] = ["admin", "employee", "client"];

function SettingsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people"],
    enabled: isAdmin,
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, job_title").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return (profiles.data ?? []).map((p) => ({
        ...p,
        role: (roles.data ?? []).find((r) => r.user_id === p.id)?.role as AppRole | undefined,
      }));
    },
  });

  async function changeRole(userId: string, role: AppRole) {
    const del = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (del.error) {
      toast.error(del.error.message);
      return;
    }
    const ins = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (ins.error) {
      toast.error(ins.error.message);
      return;
    }
    toast.success("Role updated");
    queryClient.invalidateQueries({ queryKey: ["people"] });
  }

  if (!isAdmin) {
    return (
      <AppShell title="Settings">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admins only</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">You don't have permission to view workspace settings.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" description="Manage who belongs to the workspace and what they can do.">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People and roles</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead className="w-44">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>{person.full_name ?? "Unnamed user"}</TableCell>
                    <TableCell className="text-muted-foreground">{person.job_title ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={person.role ?? undefined}
                        onValueChange={(value) => changeRole(person.id, value as AppRole)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="No role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role} className="capitalize">
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
