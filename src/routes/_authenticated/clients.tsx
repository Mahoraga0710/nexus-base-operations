import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients | NEXUS Operations" },
      { name: "description", content: "Client companies, owners and account status inside the NEXUS operations platform." },
      { property: "og:title", content: "Clients | NEXUS Operations" },
      { property: "og:description", content: "Client companies, owners and account status inside the NEXUS operations platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell title="Clients">
      <ComingSoon
        area="Client management"
        items={["Create and edit client companies", "Assign an owning employee", "Archive and status changes"]}
      />
    </AppShell>
  ),
});
