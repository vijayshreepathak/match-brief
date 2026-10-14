import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCricsheetMatch } from "@/lib/cricket/normalize";

export const FIXTURE_PATH = path.resolve(__dirname, "../../data/cricsheet/1298150.json");

export function loadRawFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

export function loadChase() {
  return normalizeCricsheetMatch(loadRawFixture(), "1298150");
}
