import type { z } from "zod";

// Provider-agnostic contract so the service can be tested with a fake model.

export interface ModelRequest<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  instructions: string;
  input: string;
}

export interface StructuredModel {
  readonly model: string;
  generate<T>(request: ModelRequest<T>): Promise<{ parsed: T; model: string }>;
}

export type ProviderFailure = "timeout" | "provider_error" | "invalid_output";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    message: string,
  ) {
    super(message);
  }
}
