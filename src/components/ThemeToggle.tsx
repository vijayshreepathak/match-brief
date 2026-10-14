"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Day/night switch. The icon and label are chosen by CSS from the class next-themes has
 * already put on <html>, so they always match the visible theme, render identically on the
 * server, and never shift layout while the component hydrates.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function toggle() {
    // Use the theme the fan can see ("system" resolves to light or dark), not the raw setting.
    const visible = resolvedTheme ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
    setTheme(visible === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      className="inline-flex h-10 min-w-[5.5rem] items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-3 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-surface-muted"
    >
      <Sun aria-hidden className="size-4 dark:hidden" />
      <Moon aria-hidden className="hidden size-4 dark:block" />
      <span className="dark:hidden">Day</span>
      <span className="hidden dark:inline">Night</span>
      <span className="sr-only dark:hidden"> theme. Switch to night theme</span>
      <span className="sr-only hidden dark:inline"> theme. Switch to day theme</span>
    </button>
  );
}
