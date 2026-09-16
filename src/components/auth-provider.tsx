import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "employee" | "client";

export type AccountStatus = "pending" | "active" | "suspended" | "disabled";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  client_id: string | null;
  email: string | null;
  status: AccountStatus;
  created_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: Profile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  isAdmin: boolean;
  isStaff: boolean;
  isClient: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let lastUserId: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = nextUserId !== lastUserId;
      lastUserId = nextUserId;
      // Token refreshes keep the same user; only re-fetch when the account actually changes.
      if (userChanged && (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")) {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
        else queryClient.clear();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  const userId = session?.user.id ?? null;

  const { data } = useQuery({
    queryKey: ["account", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [profileRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, job_title, phone, client_id, email, status, created_at")
          .eq("id", userId!)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (rolesRes.error) throw rolesRes.error;
      return {
        profile: (profileRes.data as Profile | null) ?? null,
        roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
      };
    },
  });

  const roles = data?.roles ?? [];
  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = roles.includes("admin");
    const isStaff = isAdmin || roles.includes("employee");
    return {
      session,
      user: session?.user ?? null,
      loading,
      profile: data?.profile ?? null,
      roles,
      primaryRole: isAdmin ? "admin" : roles.includes("employee") ? "employee" : (roles[0] ?? null),
      isAdmin,
      isStaff,
      isClient: !isStaff && roles.includes("client"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading, data, roles.join(",")]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
