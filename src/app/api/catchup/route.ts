import { getChase } from "@/lib/match/fixture.server";
import { getOpenAIModel } from "@/lib/ai/openai.server";
import { runCatchUp } from "@/lib/ai/service";
import { CatchUpRequestSchema, clientKey, handle, json, parseOrThrow, readJsonBody } from "@/lib/http";

export const maxDuration = 30;

// POST /api/catchup { lastSeenSeq, viewingSeq }
// Only checkpoint numbers come from the browser; the server builds all match context.
export function POST(request: Request) {
  return handle(async () => {
    const body = parseOrThrow(CatchUpRequestSchema, await readJsonBody(request));
    const response = await runCatchUp(getChase(), body, {
      model: getOpenAIModel(),
      clientKey: clientKey(request),
      log: (message) => console.warn(message),
    });
    return json(response);
  });
}
