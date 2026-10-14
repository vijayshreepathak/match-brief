import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as askPost } from "@/app/api/ask/route";
import { POST as catchupPost } from "@/app/api/catchup/route";
import { GET as replayGet } from "@/app/api/replay/route";

// Route handlers called directly, with no API key configured.

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => {
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
});

function post(body: unknown, raw?: string) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

async function call(handler: (r: Request) => Promise<Response>, req: Request) {
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

describe("POST /api/catchup", () => {
  it("returns a labelled fallback without an API key", async () => {
    const { status, body } = await call(catchupPost, post({ lastSeenSeq: 60, viewingSeq: 110 }));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, mode: "fallback", fallbackReason: "missing_config", provider: null, model: null });
  });

  it.each([
    ["out of range", { lastSeenSeq: 0, viewingSeq: 500 }, "invalid_checkpoint"],
    ["reversed", { lastSeenSeq: 110, viewingSeq: 60 }, "invalid_checkpoint"],
    ["negative", { lastSeenSeq: -1, viewingSeq: 60 }, "invalid_request"],
    ["fractional", { lastSeenSeq: 1.5, viewingSeq: 60 }, "invalid_request"],
    ["string", { lastSeenSeq: "0", viewingSeq: 60 }, "invalid_request"],
    ["missing field", { viewingSeq: 60 }, "invalid_request"],
    ["browser-supplied score", { lastSeenSeq: 0, viewingSeq: 60, score: "200/0" }, "invalid_request"],
    ["browser-chosen model", { lastSeenSeq: 0, viewingSeq: 60, model: "gemini-3.8-flash" }, "invalid_request"],
    ["browser-chosen token limit", { lastSeenSeq: 0, viewingSeq: 60, max_output_tokens: 100000 }, "invalid_request"],
    ["browser-supplied facts", { lastSeenSeq: 0, viewingSeq: 60, facts: [{ id: "F_SCORE", value: "200/0" }] }, "invalid_request"],
  ])("rejects %s checkpoints", async (_name, body, code) => {
    const res = await call(catchupPost, post(body));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code } });
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    expect((await call(catchupPost, post(null, "{not json"))).status).toBe(400);
    expect((await call(catchupPost, post(null, JSON.stringify({ pad: "x".repeat(5000) })))).status).toBe(413);
  });
});

describe("POST /api/ask", () => {
  it("answers with the fallback and tags the checkpoint", async () => {
    const { status, body } = await call(askPost, post({ lastSeenSeq: 60, viewingSeq: 110, question: "How many extras?" }));
    expect(status).toBe(200);
    expect(body.asOf).toMatchObject({ viewingSeq: 110, lastSeenSeq: 60 });
    expect(body.mode).toBe("fallback");
  });

  it("limits question length and rejects empty questions", async () => {
    const long = await call(askPost, post({ lastSeenSeq: 60, viewingSeq: 110, question: "x".repeat(281) }));
    expect(long.status).toBe(400);
    expect(long.body.error.message).toMatch(/longer than 280/);
    const empty = await call(askPost, post({ lastSeenSeq: 60, viewingSeq: 110, question: "   " }));
    expect(empty.status).toBe(400);
  });
});

describe("GET /api/replay", () => {
  const get = (qs: string) => replayGet(new NextRequest(`http://localhost/api/replay?${qs}`));

  it("moves to the end of the next over and only returns past deliveries", async () => {
    const res = await get("seq=110&step=next-over");
    const view = await res.json();
    expect(view.viewing).toEqual({ seq: 116, label: "19.0 ov · 144/4" });
    expect(view.events).toHaveLength(116);
    expect(JSON.stringify(view)).not.toMatch(/KD Karthik|R Ashwin|won by/);
  });

  it("stops at the end of the chase", async () => {
    const view = await (await get("seq=125&step=next-ball")).json();
    expect(view.viewing.seq).toBe(125);
    expect(view.canAdvance).toBe(false);
  });

  it.each(["seq=126", "seq=-1", "seq=abc", "seq=10&step=jump", "step=start", "seq=10&extra=1"])("rejects %s", async (qs) => {
    expect((await get(qs)).status).toBe(400);
  });
});
