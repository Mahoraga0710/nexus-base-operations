import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients | NEXUS Operations" },
      {
        name: "description",
        content: "Create, update and archive client companies, owners and contact details in NEXUS.",
      },
      { property: "og:title", content: "Clients | NEXUS Operations" },
      {
        property: "og:description",
        content: "Create, update and archive client companies, owners and contact details in NEXUS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientsPage,
});

type ClientStatus = "prospect" | "active" | "archived";

type ClientRow = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: ClientStatus;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
};

type FormState = {
  name: string;
  industry: string;
  website: string;
  contact_email: string;
  contact_phone: string;
  status: ClientStatus;
  owner_id: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  industry: "",
  website: "",
  contact_email: "",
  contact_phone: "",
  status: "active",
  owner_id: "",
  notes: "",
};

const statusVariant: Record<ClientStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  prospect: "secondary",
  archived: "outline",
};

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function ClientsPage() {
  const { isStaff, isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, industry, website, contact_email, contact_phone, status, owner_id, notes, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const staffQuery = useQuery({
    queryKey: ["staff-profiles"],
    enabled: isStaff,
    queryFn: async () => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "employee"]);
      if (roleError) throw roleError;
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (!ids.length) return [] as { id: string; full_name: string | null; email: string | null }[];
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  const staff = staffQuery.data ?? [];
  const ownerName = (id: string | null) => {
    if (!id) return "Unassigned";
    const match = staff.find((s) => s.id === id);
    return match?.full_name || match?.email || "Unknown";
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = clientsQuery.data ?? [];
    if (!term) return rows;
    return rows.filter((row) =>
      [row.name, row.industry, row.contact_email, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [clientsQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        industry: nullable(form.industry),
        website: nullable(form.website),
        contact_email: nullable(form.contact_email),
        contact_phone: nullable(form.contact_phone),
        status: form.status,
        owner_id: form.owner_id ? form.owner_id : null,
        notes: nullable(form.notes),
      };
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Client updated" : "Client created");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(row: ClientRow) {
    setEditing(row);
    setForm({
      name: row.name,
      industry: row.industry ?? "",
      website: row.website ?? "",
      contact_email: row.contact_email ?? "",
      contact_phone: row.contact_phone ?? "",
      status: row.status,
      owner_id: row.owner_id ?? "",
      notes: row.notes ?? "",
    });
    setDialogOpen(true);
  }

  return (
    <AppShell
      title="Clients"
      description={
        isStaff
          ? "Client companies you work with. Everything here is saved to the database."
          : "Your company record."
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clients"
            className="pl-9"
          />
        </div>
        {isStaff && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" /> New client
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {clientsQuery.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-3/5" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Building2 className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {clientsQuery.data?.length
                  ? "No clients match your search."
                  : isStaff
                    ? "No clients yet. Create the first one to get started."
                    : "No client record is linked to your account yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Industry</TableHead>
                    <TableHead className="hidden lg:table-cell">Contact</TableHead>
                    <TableHead className="hidden lg:table-cell">Owner</TableHead>
                    <TableHead>Status</TableHead>
                    {isStaff && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.name}
                        {row.website && (
                          <a
                            href={row.website.startsWith("http") ? row.website : `https://${row.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                          >
                            {row.website}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{row.industry ?? "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-sm">{row.contact_email ?? "—"}</div>
                        {row.contact_phone && (
                          <div className="text-xs text-muted-foreground">{row.contact_phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{ownerName(row.owner_id)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[row.status]} className="capitalize">
                          {row.status}
                        </Badge>
                      </TableCell>
                      {isStaff && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit client">
                              <Pencil className="size-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDeleteTarget(row)}
                                aria-label="Delete client"
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this client company." : "Add a client company to the database."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name.trim()) {
                toast.error("A client name is required");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="client-industry">Industry</Label>
                <Input
                  id="client-industry"
                  value={form.industry}
                  onChange={(event) => setForm((prev) => ({ ...prev, industry: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client-website">Website</Label>
                <Input
                  id="client-website"
                  value={form.website}
                  onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))}
                  placeholder="example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client-email">Contact email</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={form.contact_email}
                  onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client-phone">Contact phone</Label>
                <Input
                  id="client-phone"
                  value={form.contact_phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, contact_phone: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ClientStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Select
                  value={form.owner_id || "none"}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, owner_id: value === "none" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {staff.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.full_name || person.email || person.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the client. Projects linked to this client must be removed first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
