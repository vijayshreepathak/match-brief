import { getChase } from "@/lib/match/fixture.server";
import { getGeminiModel } from "@/lib/ai/gemini.server";
import { runAsk } from "@/lib/ai/service";
import { AskRequestSchema, clientKey, handle, json, parseOrThrow, readJsonBody } from "@/lib/http";

export const maxDuration = 30;

// POST /api/ask { lastSeenSeq, viewingSeq, question }
// The question is treated as untrusted text and never changes the checkpoint.
export function POST(request: Request) {
  return handle(async () => {
    const body = parseOrThrow(AskRequestSchema, await readJsonBody(request));
    const response = await runAsk(getChase(), body, {
      model: getGeminiModel(),
      clientKey: clientKey(request),
      log: (message) => console.warn(message),
    });
    return json(response);
  });
}
