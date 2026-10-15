import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MatchBrief: catch up on a T20 chase",
  description: "Missed a few overs? Understand what changed. A historical T20 chase replay with AI catch-ups grounded in ball-by-ball data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the theme class and color-scheme on <html> before React hydrates.
    // suppressHydrationWarning applies to this element's attributes only (one level deep).
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
