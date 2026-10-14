"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// The only client wrapper needed for theming. next-themes injects a small script that sets
// class="dark" (or not) on <html> before first paint, follows the OS preference until the fan
// chooses, stores an explicit choice in localStorage, and syncs it across tabs.
// Server components passed as children stay server-rendered.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
