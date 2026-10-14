// Minimal stand-in for the OpenAI Responses API, used only by the Playwright suite.
// The app talks to it through the real OpenAI SDK via OPENAI_BASE_URL, so no test
// mode exists in application code. Behaviour is chosen from the fan question text:
//   "mock:provider-error" -> HTTP 500
//   "mock:bad-evidence"   -> cites an evidence ID that does not exist
//   "mock:slow"           -> responds after 3 seconds
import http from "node:http";

const port = Number(process.env.MOCK_OPENAI_PORT ?? 4011);

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

function responseFor(model, output) {
  return {
    id: "resp_mock",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        type: "message",
        id: "msg_mock",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
      },
    ],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.end("ok");
      return;
    }
    if (req.method !== "POST" || !req.url?.endsWith("/responses")) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(await readBody(req));
    const { context, question } = parseInput(String(body.input));
    const facts = Object.fromEntries(context.facts.map((f) => [f.id, f.value]));
    const firstEvent = context.deliveries[0]?.split(" | ")[0];

    if (question.includes("mock:provider-error")) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "mock provider failure", type: "server_error" } }));
      return;
    }
    if (question.includes("mock:slow")) await new Promise((r) => setTimeout(r, 3_000));

    const output =
      body.text?.format?.name === "catch_up"
        ? {
            headline: "Mock recap of the catch-up window",
            what_changed: [
              { text: `Runs in the window: ${facts.F_INT_RUNS}.`, evidence_ids: ["F_INT_RUNS", firstEvent].filter(Boolean) },
            ],
            why_it_matters: { text: `Equation change: ${facts.F_INT_EQUATION}`, evidence_ids: ["F_INT_EQUATION"] },
            watch_next: { text: `Runs needed: ${facts.F_RUNS_NEEDED}.`, evidence_ids: ["F_RUNS_NEEDED"] },
          }
        : {
            status: "answered",
            answer: `Mock answer. ${facts.F_SCORE}.`,
            evidence_ids: question.includes("mock:bad-evidence") ? ["E999"] : ["F_SCORE"],
          };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(responseFor(body.model, output)));
  })
  .listen(port, "127.0.0.1", () => console.log(`mock OpenAI listening on ${port}`));
