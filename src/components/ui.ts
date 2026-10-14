// Shared class names so panels and controls look the same everywhere.

export const card = "rounded-2xl border border-border bg-surface shadow-card";

const base = "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors duration-150";

/** 44px-tall secondary control. */
export const buttonSecondary = `${base} h-11 border border-border-strong bg-surface px-3 text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50`;

const primaryLook = `${base} h-11 border border-transparent bg-primary px-4 text-primary-foreground`;

/** 44px-tall primary action. Disabled looks neutral (not a faded green) in both themes. */
export const buttonPrimary = `${primaryLook} hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted`;

/** A primary action whose request is running: keeps its colour and shows a wait cursor. */
export const buttonPrimaryBusy = `${primaryLook} cursor-wait opacity-80`;

export const inputField =
  "h-11 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-muted";
