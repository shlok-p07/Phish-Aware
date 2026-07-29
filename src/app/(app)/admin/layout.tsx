"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Building2, Users, BarChart3, ClipboardList, Settings2 } from "lucide-react";
import { useOrgQuery } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Members", icon: Users, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/training", label: "Assign training", icon: ClipboardList },
  { href: "/admin/settings", label: "Organization", icon: Settings2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: org, isLoading } = useOrgQuery();
  const pathname = usePathname();
  const router = useRouter();

  // No org yet — send the user to the create flow.
  useEffect(() => {
    if (!isLoading && !org && pathname !== "/admin/create") router.replace("/admin/create");
  }, [isLoading, org, pathname, router]);

  // The create page renders outside the tabbed chrome.
  if (pathname === "/admin/create") return <>{children}</>;
  if (isLoading || !org) return null;

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
