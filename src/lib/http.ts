import { z } from "zod";
import { CheckpointError } from "@/lib/cricket/engine";
import { MAX_QUESTION_LENGTH, type ErrorResponse } from "@/lib/ai/types";

// Request validation and JSON helpers shared by the route handlers.

const MAX_BODY_BYTES = 4_096;
const seq = z.number().int().min(0).max(10_000);

export const CatchUpRequestSchema = z.strictObject({ viewingSeq: seq, lastSeenSeq: seq });

export const AskRequestSchema = z.strictObject({
  viewingSeq: seq,
  lastSeenSeq: seq,
  question: z.string().trim().min(1, "Question is empty").max(MAX_QUESTION_LENGTH, `Question is longer than ${MAX_QUESTION_LENGTH} characters`),
});

export const ReplayQuerySchema = z.strictObject({
  seq: z.string().regex(/^\d{1,5}$/, "seq must be a whole number").transform(Number),
  step: z.enum(["start", "prev-over", "next-ball", "next-over", "current"]).default("current"),
});

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(status: number, code: string, message: string): Response {
  const body: ErrorResponse = { ok: false, error: { code, message } };
  return json(body, status);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "Request body is too large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "Request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON");
  }
}

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new HttpError(400, "invalid_request", `${where}${issue?.message ?? "invalid request"}`);
  }
  return result.data;
}

/** Best-effort client identifier for the process-local rate limiter. */
export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "anonymous"
  );
}

/** Maps expected errors to JSON; hides unexpected ones behind a generic message. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) return errorJson(error.status, error.code, error.message);
    if (error instanceof CheckpointError) return errorJson(400, "invalid_checkpoint", error.message);
    console.error("Unhandled route error:", error instanceof Error ? error.message : "unknown");
    return errorJson(500, "internal_error", "Something went wrong. Please try again.");
  }
}
