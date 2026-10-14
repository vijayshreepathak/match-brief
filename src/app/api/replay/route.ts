import type { NextRequest } from "next/server";
import { stepTarget } from "@/lib/cricket/engine";
import { getChase } from "@/lib/match/fixture.server";
import { buildReplayView } from "@/lib/match/view";
import { ReplayQuerySchema, handle, json, parseOrThrow } from "@/lib/http";

// GET /api/replay?seq=<checkpoint>&step=<start|prev-over|next-ball|next-over|current>
// The server decides where a step lands, so the browser never learns future positions.
export function GET(request: NextRequest) {
  return handle(() => {
    const query = parseOrThrow(ReplayQuerySchema, Object.fromEntries(request.nextUrl.searchParams));
    const chase = getChase();
    return json(buildReplayView(chase, stepTarget(chase, query.seq, query.step)));
  });
}
