import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The assignment allows a note of at most 200 words. Counted like `wc -w`, after
// removing markdown bold markers.
describe("submission note", () => {
  const doc = readFileSync(path.resolve(import.meta.dirname, "../../docs/SUBMISSION.md"), "utf8");
  const note = doc.split("<!-- note:start -->")[1]?.split("<!-- note:end -->")[0] ?? "";
  const words = note.replace(/\*\*/g, "").trim().split(/\s+/).filter(Boolean);

  it("exists and stays within 200 words", () => {
    expect(words.length).toBeGreaterThan(50);
    expect(words.length).toBeLessThanOrEqual(200);
  });

  it("discloses the historical replay and names the AI tools", () => {
    expect(note).toMatch(/historical replay, not live data/);
    expect(note).toMatch(/GPT-5\.4 mini/);
  });
});
