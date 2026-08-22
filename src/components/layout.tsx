"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Shield, Home, BookOpen, Target, User, BarChart3, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Building2 } from "lucide-react";
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@/api-client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GuestBanner } from "@/components/guest-banner";
import { ChatbotProvider } from "@/components/chatbot-widget";
import { useQueryClient } from "@tanstack/react-query";
import { useMounted } from "@/hooks/use-mounted";
import { OrgAccent, OrgLogo } from "@/components/org-brand";

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";

/**
 * Sidebar text that collapses away with the rail. The label stays in the DOM so
 * it can animate, which means it also stays in the accessibility tree -- so it's
 * explicitly hidden from assistive tech once it's visually gone, and the owning
 * control carries an aria-label instead.
 */
function NavLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-hidden={collapsed || undefined}
      className={`whitespace-nowrap transition-[opacity,max-width] duration-300 ease-in-out ${collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-40"}`}
    >
      {children}
    </span>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center py-3.5 rounded-lg transition-all font-semibold ${collapsed ? "justify-center px-0" : "gap-4 px-4"} ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      <Icon className="w-6 h-6 shrink-0" />
      <NavLabel collapsed={collapsed}>{label}</NavLabel>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  // The persisted value can't be read on the server, so the first render (and
  // hydration) uses the expanded default and the stored preference is picked up
  // immediately afterwards -- same behaviour as the effect this replaces, minus
  // the state update inside it.
  const mounted = useMounted();
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const collapsed =
    collapsedOverride ??
    (mounted ? localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true" : false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    setCollapsedOverride(next);
  };

  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const logout = useLogout();

  // Three distinct states, and they need three different affordances:
  //   admin of an org  -> "Admin"
  //   member of an org -> nothing (every admin endpoint would 403)
  //   no org at all    -> "Create org"
  // This used to key off whether GET /api/org succeeded, which is true for
  // ANY member -- fine while only admins were ever in orgs, wrong the moment
  // employees started joining via invitations and SSO.
  const isOrgAdmin = user?.role === "admin" && user.hasOrg === true;
  const showCreateOrg = Boolean(user) && !user!.isGuest && user!.hasOrg === false;

  useEffect(() => {
    if (!isLoading) {
      if (isError || !user) {
        if (pathname !== "/auth") router.push("/auth");
      } else if (!user.onboardingCompleted && pathname !== "/onboarding" && pathname !== "/auth") {
        router.push("/onboarding");
      }
    }
  }, [user, isLoading, isError, pathname, router]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        router.push("/auth");
      }
    });
  };

  if (isLoading || (!user && pathname !== "/auth")) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Shield className="w-12 h-12 text-primary opacity-50" />
          <p className="text-muted-foreground font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return null; // Let the useEffect redirect handle it

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Home" },
    { href: "/learn", icon: BookOpen, label: "Learn" },
    { href: "/practice", icon: Target, label: "Practice" },
    { href: "/leaderboard", icon: BarChart3, label: "Leaderboard" },
  ];

  const workspace = user.workspace ?? null;

  return (
    <ChatbotProvider>
    {/* An organisation's own colour, applied once for the whole shell. Rendered
        here rather than per page so it is in place before anything paints. */}
    <OrgAccent accentColor={workspace?.branding?.accentColor ?? null} />
    <div className="min-h-dvh flex flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex ${collapsed ? "w-20" : "w-72"} flex-col border-r border-border bg-card px-4 py-6 sticky top-0 h-dvh overflow-hidden transition-[width] duration-300 ease-in-out`}>
        <div className={`flex items-center mb-6 ${collapsed ? "justify-center px-0" : "gap-3 px-2"}`}>
          <Link href="/dashboard" className={`flex items-center min-w-0 hover:opacity-80 transition-opacity ${collapsed ? "" : "gap-3"}`}>
            <div className="bg-primary text-primary-foreground p-2 rounded-lg shadow-sm shrink-0">
              <Shield className="w-7 h-7" />
            </div>
            <span className={`text-2xl font-display font-bold text-foreground whitespace-nowrap transition-[opacity,max-width] duration-300 ease-in-out ${collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-40"}`}>PhishAware</span>
          </Link>
          <button onClick={toggleCollapsed} className={`ml-auto p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors hover:cursor-pointer ${collapsed ? "hidden" : ""}`} aria-label="Collapse sidebar">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* Whose workspace this is. PhishAware is the vendor mark above; an
            employee of a customer should see their own employer here, which is
            the difference between using a tool and being given one. */}
        {workspace?.orgName && (
          <div
            className={`flex items-center mb-4 rounded-lg bg-muted/40 ${collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2"}`}
            title={collapsed ? workspace.orgName : undefined}
          >
            <OrgLogo
              logoUrl={workspace.branding?.logoUrl}
              orgName={workspace.orgName}
              className="h-7 w-7 shrink-0"
            />
            <div
              className={`min-w-0 transition-[opacity,max-width] duration-300 ease-in-out ${collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-40"}`}
              aria-hidden={collapsed || undefined}
            >
              <p className="truncate text-sm font-semibold leading-tight">{workspace.orgName}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Workspace
              </p>
            </div>
          </div>
        )}

        {collapsed && (
          <button onClick={toggleCollapsed} className="flex items-center justify-center p-3 mb-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors hover:cursor-pointer" aria-label="Expand sidebar">
            <PanelLeftOpen className="w-6 h-6" />
          </button>
        )}

        {/* Profile bubble -- links to profile screen */}
        <Link
          href="/profile"
          title={collapsed ? user.name : undefined}
          className={`flex items-center mb-8 rounded-lg transition-all ${collapsed ? "justify-center p-2" : "gap-3 px-3 py-3"} ${pathname === "/profile" ? "bg-primary/10" : "bg-muted/50 hover:bg-muted"}`}
        >
          <div className={`flex items-center justify-center rounded-full bg-primary/15 text-primary font-bold shrink-0 ${collapsed ? "w-10 h-10 text-base" : "w-11 h-11 text-lg"}`}>
            {user.name?.charAt(0).toUpperCase() ?? <User className="w-5 h-5" />}
          </div>
          <div className={`min-w-0 transition-[opacity,max-width] duration-300 ease-in-out ${collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-40"}`} aria-hidden={collapsed || undefined}>
            <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
            <p className="text-xs font-medium text-muted-foreground capitalize mt-0.5 whitespace-nowrap">{user.level} level • {user.xp.toLocaleString()} pts</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-2" aria-label="Main">
          {navItems.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={pathname === item.href}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="mt-auto pt-6 space-y-2">
          {!user.isGuest && (isOrgAdmin || showCreateOrg) && (
            <SidebarLink
              href={isOrgAdmin ? "/admin" : "/admin/create"}
              icon={Building2}
              label={isOrgAdmin ? "Admin" : "Create org"}
              active={pathname.startsWith("/admin")}
              collapsed={collapsed}
            />
          )}
          <SidebarLink
            href="/settings"
            icon={Settings}
            label="Settings"
            active={pathname === "/settings"}
            collapsed={collapsed}
          />
          <Button variant="ghost" title={collapsed ? "Log out" : undefined} aria-label={collapsed ? "Log out" : undefined} className={`w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg py-6 hover:cursor-pointer ${collapsed ? "justify-center px-0" : "justify-start"}`} onClick={handleLogout}>
            <LogOut className={`w-5 h-5 ${collapsed ? "" : "mr-3"}`} />
            <NavLabel collapsed={collapsed}>
              <span className="font-semibold">Log out</span>
            </NavLabel>
          </Button>
        </div>
      </aside>

      {/* Main Content. Width is deliberately NOT capped here -- each page picks
          its own measure via <PageShell width>. Capping here as well meant a
          page asking for a wider shell (practice's feedback view) silently got
          clamped to this value instead. */}
      <main className="flex-1 flex flex-col min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 relative w-full">
        {user.isGuest && <GuestBanner createdAt={user.createdAt} />}
        <div className={`md:hidden flex items-center justify-between p-4 border-b border-border bg-card z-40 ${user.isGuest ? "" : "sticky top-0"}`}>
          <div className="flex items-center gap-2">
             <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-xl font-display font-bold">PhishAware</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/settings" aria-label="Settings" className={`p-2 rounded-lg ${pathname === "/settings" ? "text-primary" : "text-muted-foreground"}`}>
              <Settings className="w-5 h-5" />
            </Link>
            <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={handleLogout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 p-4 md:p-8 lg:p-12 overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav. The bottom padding is the home-indicator inset --
          this used to say `pb-safe`, which is not a real utility, so the nav sat
          underneath the indicator on notched phones. Pairs with viewportFit:
          "cover" in app/layout.tsx, without which the inset resolves to 0px. */}
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-50"
      >
        {[...navItems, { href: "/profile", icon: User, label: "Profile" }].map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center p-2 rounded-lg transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <div className={`p-1.5 rounded-full ${active ? "bg-primary/10" : ""}`}>
                <item.icon className={`w-6 h-6 ${active ? "fill-primary/20" : ""}`} />
              </div>
              <span className="text-[10px] font-bold mt-1 tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
    </ChatbotProvider>
  );
}