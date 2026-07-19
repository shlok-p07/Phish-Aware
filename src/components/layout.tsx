"use client";
import { Link, useLocation } from "@/lib/nav";
import { Shield, Home, BookOpen, Target, User, Trophy, LogOut } from "lucide-react";
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@/api-client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading) {
      if (isError || !user) {
        if (location !== "/auth") setLocation("/auth");
      } else {
        const hasOnboarded = localStorage.getItem(`onboardingCompleted_${user.id}`);
        if (!hasOnboarded && location !== "/onboarding" && location !== "/auth") {
          setLocation("/onboarding");
        }
      }
    }
  }, [user, isLoading, isError, location, setLocation]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/auth");
      }
    });
  };

  if (isLoading || (!user && location !== "/auth")) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Shield className="w-12 h-12 text-primary opacity-50" />
          <p className="text-muted-foreground font-medium">Loading your safe space...</p>
        </div>
      </div>
    );
  }

  if (!user) return null; // Let the useEffect redirect handle it

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Home" },
    { href: "/learn", icon: BookOpen, label: "Learn" },
    { href: "/practice", icon: Target, label: "Practice" },
    { href: "/leaderboard", icon: Trophy, label: "Rankings" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col border-r-2 border-border bg-card px-4 py-6 sticky top-0 h-[100dvh]">
        <Link href="/dashboard" className="flex items-center gap-3 px-2 mb-10 hover:opacity-80 transition-opacity">
          <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-sm">
            <Shield className="w-7 h-7" />
          </div>
          <span className="text-2xl font-display font-bold text-foreground">PhishAware</span>
        </Link>
        
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <item.icon className="w-6 h-6" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 border-t-2 border-border">
          <div className="px-4 py-3 mb-2 bg-muted/50 rounded-2xl">
            <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
            <p className="text-xs font-medium text-muted-foreground capitalize mt-0.5">{user.level} Level • {user.xp} XP</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl py-6" onClick={handleLogout}>
            <LogOut className="w-5 h-5 mr-3" />
            <span className="font-semibold">Log out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 relative max-w-5xl mx-auto w-full">
        <div className="md:hidden flex items-center justify-between p-4 border-b-2 border-border bg-card sticky top-0 z-40">
          <div className="flex items-center gap-2">
             <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-xl font-display font-bold">PhishAware</span>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="flex-1 p-4 md:p-8 lg:p-12 overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border flex items-center justify-around p-2 pb-safe z-50">
        {navItems.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center p-2 rounded-xl transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`p-1.5 rounded-full ${active ? "bg-primary/10" : ""}`}>
                <item.icon className={`w-6 h-6 ${active ? "fill-primary/20" : ""}`} />
              </div>
              <span className="text-[10px] font-bold mt-1 tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}