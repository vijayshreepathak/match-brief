import { describe, expect, it } from "vitest";
import { toGeminiJsonSchema } from "@/lib/ai/gemini.server";
import { AnswerOutputSchema, CatchUpOutputSchema } from "@/lib/ai/prompts";

// Gemini structured output accepts a documented subset of JSON Schema
// (ai.google.dev/gemini-api/docs/structured-output). The generated schemas must stay inside it.
const SUPPORTED = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "format",
  "title",
  "description",
]);

type Json = Record<string, unknown>;

function keywords(schema: Json, out = new Set<string>()): Set<string> {
  for (const [key, value] of Object.entries(schema)) {
    out.add(key);
    if (key === "properties") for (const child of Object.values(value as Record<string, Json>)) keywords(child, out);
    if (key === "items" && value && typeof value === "object") keywords(value as Json, out);
  }
  return out;
}

function assertStrict(schema: Json, at = "root") {
  if (schema.type === "object") {
    expect(schema.additionalProperties, `${at}.additionalProperties`).toBe(false);
    expect([...((schema.required as string[]) ?? [])].sort(), `${at}.required`).toEqual(Object.keys((schema.properties as Json) ?? {}).sort());
    for (const [key, child] of Object.entries((schema.properties as Record<string, Json>) ?? {})) assertStrict(child, `${at}.${key}`);
  }
  if (schema.items) assertStrict(schema.items as Json, `${at}[]`);
}

describe("Gemini response schemas", () => {
  it.each([
    ["catch_up", CatchUpOutputSchema],
    ["answer", AnswerOutputSchema],
  ] as const)("%s uses only supported keywords and requires every field", (_name, schema) => {
    const json = toGeminiJsonSchema(schema);
    expect(json).not.toHaveProperty("$schema");
    const unsupported = [...keywords(json)].filter((k) => !SUPPORTED.has(k));
    expect(unsupported).toEqual([]);
    assertStrict(json);
  });

  it("constrains delivery kinds to the canonical enum", () => {
    const json = toGeminiJsonSchema(AnswerOutputSchema) as { properties: { events: { items: { properties: { kind: { enum: string[] } } } } } };
    expect(json.properties.events.items.properties.kind.enum).toEqual(["wicket", "six", "four", "wide", "no_ball", "bye", "leg_bye", "runs", "dot"]);
  });
});
