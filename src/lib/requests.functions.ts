import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifyTurnstile } from "@/lib/turnstile.server";

const linkSchema = z.object({
  url: z.string().trim().url().max(2000),
  label: z.string().trim().max(120).optional(),
});

const submitSchema = z.object({
  kind: z.enum(["task", "project"]),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(5000),
  projectId: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  desiredDate: z.string().trim().min(1).nullable().optional(),
  links: z.array(linkSchema).max(10).default([]),
  turnstileToken: z.string().optional(),
});

function friendlyError(message: string): string {
  if (message.includes("REQUEST_LIMIT_REACHED")) {
    return "LIMIT_REACHED";
  }
  if (message.includes("REQUEST_COOLDOWN")) {
    return "Please wait a few seconds before submitting another request.";
  }
  return message;
}

export const submitClientRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    await verifyTurnstile(data.turnstileToken, ip);

    const supabase = context.supabase;
    const userId = context.userId;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, client_id, full_name, email")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.client_id) {
      throw new Error("Only client accounts linked to a company can submit requests.");
    }

    if (data.kind === "task" && !data.projectId) {
      throw new Error("Choose the project this task belongs to.");
    }

    const { data: inserted, error: insertError } = await supabase
      .from("client_requests")
      .insert({
        client_id: profile.client_id,
        requester_id: userId,
        kind: data.kind,
        project_id: data.kind === "task" ? data.projectId! : null,
        title: data.title,
        body: data.body,
        priority: data.priority,
        desired_date: data.desiredDate || null,
        status: "submitted" as const,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(friendlyError(insertError.message));

    const requestId = inserted.id;

    if (data.links.length) {
      const { error: linkError } = await supabase.from("request_links").insert(
        data.links.map((link) => ({
          request_id: requestId,
          url: link.url,
          label: link.label?.length ? link.label : null,
        })),
      );
      if (linkError) throw new Error(linkError.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let createdTaskId: string | null = null;
    if (data.kind === "task" && data.projectId) {
      const { data: task, error: taskError } = await supabaseAdmin
        .from("tasks")
        .insert({
          project_id: data.projectId,
          title: data.title,
          description: data.body,
          status: "requested" as const,
          priority: data.priority,
          due_date: data.desiredDate || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (taskError) throw new Error(taskError.message);
      createdTaskId = task.id;
      await supabaseAdmin.from("client_requests").update({ created_task_id: createdTaskId }).eq("id", requestId);
    }

    // Notify staff that a new request has landed.
    const { data: staffRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "employee"]);
    const staffIds = Array.from(new Set((staffRoles ?? []).map((r) => r.user_id)));
    if (staffIds.length) {
      await supabaseAdmin.from("notifications").insert(
        staffIds.map((id) => ({
          user_id: id,
          type: "client_request",
          title: data.kind === "project" ? "New project request" : "New task request",
          body: `${profile.full_name || profile.email || "A client"}: ${data.title}`,
          link: "/requests",
        })),
      );
    }

    return { id: requestId, createdTaskId };
  });

const resolveSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["accept", "decline", "complete"]),
  note: z.string().trim().max(2000).optional(),
});

export const resolveClientRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "employee");
    if (!isStaff) throw new Error("Only staff can review requests.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqError } = await supabaseAdmin
      .from("client_requests")
      .select("id, kind, title, body, client_id, requester_id, project_id, created_task_id, created_project_id, priority, desired_date")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqError) throw new Error(reqError.message);
    if (!req) throw new Error("Request not found.");

    let createdProjectId: string | null = req.created_project_id;

    if (data.action === "accept") {
      if (req.kind === "project" && !createdProjectId) {
        const { data: project, error: projectError } = await supabaseAdmin
          .from("projects")
          .insert({
            client_id: req.client_id,
            name: req.title,
            description: req.body,
            status: "planning" as const,
            priority: req.priority,
            due_date: req.desired_date,
            created_by: userId,
          })
          .select("id")
          .single();
        if (projectError) throw new Error(projectError.message);
        createdProjectId = project.id;
      }
      if (req.kind === "task" && req.created_task_id) {
        await supabaseAdmin.from("tasks").update({ status: "todo" as const }).eq("id", req.created_task_id);
      }
    }

    if (data.action === "decline" && req.kind === "task" && req.created_task_id) {
      await supabaseAdmin.from("tasks").delete().eq("id", req.created_task_id);
    }

    const status = data.action === "accept" ? "accepted" : data.action === "decline" ? "declined" : "completed";

    const { error: updateError } = await supabaseAdmin
      .from("client_requests")
      .update({
        status,
        resolution_note: data.note?.length ? data.note : null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        created_project_id: createdProjectId,
        ...(data.action === "decline" && req.kind === "task" ? { created_task_id: null } : {}),
      })
      .eq("id", data.requestId);
    if (updateError) throw new Error(updateError.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: req.requester_id,
      type: "client_request",
      title:
        status === "accepted"
          ? "Request accepted"
          : status === "declined"
            ? "Request declined"
            : "Request completed",
      body: req.title,
      link: "/requests",
    });

    return { status, createdProjectId };
  });
