import type { ReplayStep } from "@/lib/cricket/engine";
import type { ReplayView } from "@/lib/match/view";

// Browser-side fetch helpers with a timeout and a distinguishable "aborted" outcome.

const TIMEOUT_MS = 35_000;

export class RequestAborted extends Error {}

export class RequestFailed extends Error {}

async function request<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      throw new RequestFailed(data?.error?.message ?? `Request failed (${res.status}).`);
    }
    return data as T;
  } catch (error) {
    if (signal?.aborted) throw new RequestAborted("aborted");
    if (error instanceof RequestFailed) throw error;
    if (controller.signal.aborted) throw new RequestFailed("The request timed out. Please try again.");
    throw new RequestFailed("Network error. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function fetchReplay(seq: number, step: ReplayStep): Promise<ReplayView> {
  return request<ReplayView>(`/api/replay?seq=${seq}&step=${step}`, { method: "GET" });
}

export function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    signal,
  );
}
