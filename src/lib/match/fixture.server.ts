import "server-only";
import raw from "../../../data/cricsheet/1298150.json";
import { normalizeCricsheetMatch } from "@/lib/cricket/normalize";
import { endOfOver } from "@/lib/cricket/engine";
import type { Chase } from "@/lib/cricket/types";

// The full fixture (including the result metadata it contains) lives only in the
// server bundle. Browser code receives views built from past deliveries only.

let chase: Chase | null = null;

export function getChase(): Chase {
  chase ??= normalizeCricsheetMatch(raw as unknown, "1298150");
  return chase;
}

/** Demo defaults: the fan stopped watching after over 10 and is now at the end of over 18. */
export function defaultCheckpoints(c: Chase = getChase()) {
  return { lastSeenSeq: endOfOver(c, 10), viewingSeq: endOfOver(c, 18) };
}
