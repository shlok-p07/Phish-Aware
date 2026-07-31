"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Building2, Users, BarChart3, ClipboardList, Settings2 } from "lucide-react";
import { useGetOrg, useGetCurrentUser, getGetCurrentUserQueryKey } from "@/api-client";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Members", icon: Users, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/training", label: "Assign training", icon: ClipboardList },
  { href: "/admin/settings", label: "Organization", icon: Settings2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: org, isLoading } = useGetOrg({ query: { retry: false } });
  const { data: user, isLoading: userLoading } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = user?.role === "admin";
  const ready = !isLoading && !userLoading;

  useEffect(() => {
    if (!ready || !user) return;
    if (pathname === "/admin/create") {
      // Already in an org, so there's nothing to create -- POST /api/org would
      // just 409.
      if (user.hasOrg) router.replace(isAdmin ? "/admin" : "/dashboard");
      return;
    }
    // A member who isn't an admin gets bounced rather than shown the chrome:
    // every request this section makes is gated by requireOrgAdmin and would
    // 403, which used to render as an empty page with no explanation.
    if (!isAdmin) {
      router.replace("/dashboard");
      return;
    }
    // Admin with no org yet — send them through the create flow.
    if (!org) router.replace("/admin/create");
  }, [ready, org, user, isAdmin, pathname, router]);

  // The create page renders outside the tabbed chrome.
  if (pathname === "/admin/create") {
    return ready && user && !user.hasOrg ? <>{children}</> : null;
  }
  if (!ready || !org || !isAdmin) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2.5 rounded-lg">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold leading-tight">
            {org.name}
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Organization administration
          </p>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
