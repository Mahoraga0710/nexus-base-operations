import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, FolderKanban, ListChecks, Inbox, Settings, Hexagon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth-provider";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; staffOnly?: boolean; adminOnly?: boolean };

const items: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", url: "/clients", icon: Building2, staffOnly: true },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Tasks", url: "/tasks", icon: ListChecks },
  { title: "Requests", url: "/requests", icon: Inbox },
  { title: "Settings", url: "/settings", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isStaff, isAdmin } = useAuth();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const visible = items.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.staffOnly) return isStaff;
    return true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Hexagon className="size-4" />
          </span>
          {!collapsed && (
            <span className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">
              NEXUS
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={currentPath === item.url} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
