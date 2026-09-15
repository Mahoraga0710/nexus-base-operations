import { createFileRoute, Link } from "@tanstack/react-router";
import { Hexagon, ShieldCheck, Users, KanbanSquare } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXUS — Client & Project Operations Platform" },
      {
        name: "description",
        content:
          "NEXUS keeps client accounts, projects, tasks and team activity in one operations workspace for software teams.",
      },
      { property: "og:title", content: "NEXUS — Client & Project Operations Platform" },
      {
        property: "og:description",
        content:
          "NEXUS keeps client accounts, projects, tasks and team activity in one operations workspace for software teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Hexagon className="size-4" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">NEXUS</span>
        </div>
        {session ? (
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10">
        <section className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Operations platform
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            One workspace for clients, projects and delivery.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            NEXUS gives software teams a single place to run client accounts, plan projects, assign work, and keep an
            auditable record of everything that happens.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={session ? "/dashboard" : "/auth"}>{session ? "Open dashboard" : "Get started"}</Link>
            </Button>
          </div>
        </section>

        <section className="mt-20 grid gap-8 sm:grid-cols-3">
          {[
            { icon: Users, title: "Roles that matter", body: "Admins, employees and clients each see exactly what they should." },
            { icon: KanbanSquare, title: "Built for delivery", body: "Clients, projects, tasks and comments are modelled from day one." },
            { icon: ShieldCheck, title: "Enforced, not implied", body: "Access rules live in the database, so data stays protected." },
          ].map((feature) => (
            <div key={feature.title}>
              <feature.icon className="mb-3 size-5 text-primary" />
              <h2 className="font-display text-base font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
