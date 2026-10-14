// Minimal stand-in for the Gemini REST API (models.generateContent), used only by Playwright.
// The app reaches it through the real @google/genai SDK via GEMINI_BASE_URL, so the request
// and parsing path is the production one. Behaviour is chosen from the fan question text:
//   "mock:provider-error" -> HTTP 503 (retried once by the app, then falls back)
//   "mock:bad-evidence"   -> cites a delivery that does not exist
//   "mock:slow"           -> responds after 3 seconds
//   "mock:safety"         -> prompt blocked for safety
//   "mock:incomplete"     -> finishReason MAX_TOKENS
//   "mock:quota"          -> HTTP 429 with a per-day quota violation
//   "mock:empty"          -> no candidates
import http from "node:http";

const port = Number(process.env.MOCK_GEMINI_PORT ?? 4311);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseInput(input) {
  const [contextPart, questionPart] = input.split("\n\nFAN_QUESTION");
  const context = JSON.parse(contextPart.replace(/^MATCH_CONTEXT:\n/, ""));
  const question = questionPart ? (questionPart.split('"""\n')[1] ?? "").split('\n"""')[0] : "";
  return { context, question };
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function candidate(output, finishReason = "STOP") {
  return {
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(output) }] }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    modelVersion: "mock-gemini",
  };
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.end("ok");
      return;
    }
    if (req.method !== "POST" || !req.url?.includes(":generateContent")) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(await readBody(req));
    const { context, question } = parseInput(String(body.contents?.[0]?.parts?.[0]?.text ?? ""));
    const isCatchUp = Boolean(body.generationConfig?.responseJsonSchema?.properties?.headline);
    // Delivery lines look like "E61 | 10.1 | bowler to batter | dot ball | kinds: dot".
    const [firstId, , , , kinds] = (context.deliveries[0] ?? "").split(" | ");
    const firstEvent = firstId ? [{ id: firstId, kind: kinds.replace("kinds: ", "").split(", ")[0] }] : [];

    if (question.includes("mock:provider-error")) {
      send(res, 503, { error: { code: 503, status: "UNAVAILABLE", message: "mock overload" } });
      return;
    }
    if (question.includes("mock:quota")) {
      send(res, 429, {
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message: "You exceeded your current quota.",
          details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }],
        },
      });
      return;
    }
    if (question.includes("mock:safety")) {
      send(res, 200, { promptFeedback: { blockReason: "SAFETY" }, candidates: [] });
      return;
    }
    if (question.includes("mock:empty")) {
      send(res, 200, { candidates: [] });
      return;
    }
    if (question.includes("mock:slow")) await new Promise((r) => setTimeout(r, 3_000));

    // Words only: the app renders the numbers from the selected facts.
    const output = isCatchUp
      ? {
          headline: "Mock recap of the catch-up window",
          what_changed: [{ note: "Mock note about the window.", fact_ids: ["F_INT_RUNS"], events: firstEvent }],
          why_it_matters: { note: "Mock interpretation of the equation.", fact_ids: ["F_INT_EQUATION"], events: [] },
          watch_next: { note: "Mock requirement to watch.", fact_ids: ["F_RUNS_NEEDED"], events: [] },
        }
      : {
          status: "answered",
          answer: "Mock answer from the match data.",
          fact_ids: ["F_SCORE"],
          events: question.includes("mock:bad-evidence") ? [{ id: "E999", kind: "dot" }] : [],
        };
    send(res, 200, candidate(output, question.includes("mock:incomplete") ? "MAX_TOKENS" : "STOP"));
  })
  .listen(port, "127.0.0.1", () => console.log(`mock Gemini listening on ${port}`));
