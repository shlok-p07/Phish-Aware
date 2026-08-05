"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Building2, Users, BarChart3, ClipboardList, Settings2 } from "lucide-react";
import { useGetOrg, useGetCurrentUser, getGetCurrentUserQueryKey } from "@/api-client";
import { cn } from "@/lib/utils";
import { PageHeader, PageShell } from "@/components/page-shell";

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
    <PageShell>
      {/* This section's <h1> lives here rather than on each tab, so the child
          pages deliberately don't render a PageHeader of their own. */}
      <PageHeader
        icon={Building2}
        title={org.name}
        description="Organization administration"
        className="border-b-0 pb-0"
      />

      {/* Sub-navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto -mb-px" aria-label="Administration">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-t-md",
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
    </PageShell>
  );
}
