import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import { AnswerOutputSchema, CatchUpOutputSchema } from "@/lib/ai/prompts";

// Structured Outputs strict mode needs every property required and no extra properties.
type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean; items?: JsonSchema };

function assertStrict(schema: JsonSchema, at = "root") {
  if (schema.type === "object") {
    expect(schema.additionalProperties, `${at}.additionalProperties`).toBe(false);
    expect([...(schema.required ?? [])].sort(), `${at}.required`).toEqual(Object.keys(schema.properties ?? {}).sort());
    for (const [key, child] of Object.entries(schema.properties ?? {})) assertStrict(child, `${at}.${key}`);
  }
  if (schema.items) assertStrict(schema.items, `${at}[]`);
}

describe("model output schemas", () => {
  it.each([
    ["catch_up", CatchUpOutputSchema],
    ["answer", AnswerOutputSchema],
  ] as const)("%s converts to a strict JSON schema", (name, schema) => {
    const format = zodTextFormat(schema, name);
    expect(format).toMatchObject({ type: "json_schema", name, strict: true });
    assertStrict(format.schema as JsonSchema);
  });
});
