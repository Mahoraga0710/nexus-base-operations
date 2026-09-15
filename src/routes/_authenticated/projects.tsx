import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects | NEXUS Operations" },
      { name: "description", content: "Delivery projects with clients, teams, status and deadlines in NEXUS." },
      { property: "og:title", content: "Projects | NEXUS Operations" },
      { property: "og:description", content: "Delivery projects with clients, teams, status and deadlines in NEXUS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell title="Projects">
      <ComingSoon
        area="Project management"
        items={["Create projects for a client", "Assign a lead and team members", "Status, priority, budget and deadlines"]}
      />
    </AppShell>
  ),
});
