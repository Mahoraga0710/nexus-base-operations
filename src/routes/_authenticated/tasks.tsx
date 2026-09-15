import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks | NEXUS Operations" },
      { name: "description", content: "Task assignments, priorities and deadlines across every NEXUS project." },
      { property: "og:title", content: "Tasks | NEXUS Operations" },
      { property: "og:description", content: "Task assignments, priorities and deadlines across every NEXUS project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell title="Tasks">
      <ComingSoon
        area="Task management"
        items={["Kanban board with drag and drop", "Assignment, priority and due dates", "Subtasks and dependencies"]}
      />
    </AppShell>
  ),
});
