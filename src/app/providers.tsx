"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AccessibilityProvider } from "@/hooks/use-accessibility";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Defaults are staleTime: 0 and refetchOnWindowFocus: true, which
            // together mean every query refetches every time a component
            // remounts or the tab regains focus -- across a debugging
            // session (alt-tabbing to devtools, re-focusing the window
            // repeatedly) that adds up to hundreds of redundant requests for
            // data that rarely changes mid-session. Mutations already
            // explicitly invalidateQueries() on success everywhere in this
            // app, so correctness after an action doesn't depend on
            // automatic refetch-on-focus.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AccessibilityProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}
