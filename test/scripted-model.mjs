import { createServer } from "node:http"

// A scripted OpenAI-compatible model on 127.0.0.1 that streams one reply per
// request. next(body) gets each completion request's body and returns { id, action,
// callId }: action [tool, arguments] makes a call to tool, with callId (default id)
// as its call ID; no action replies with the text "done". Model list requests get {}.
export async function startModel(next) {
  const server = createServer(async (req, res) => {
    if (req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
    let body = ""; for await (const data of req) body += data
    const { id, action, callId = id } = next(body)
    const base = { id, object: "chat.completion.chunk", created: 0, model: "fixture" }
    const delta = action ? { role: "assistant", tool_calls: [{ index: 0, id: callId, type: "function", function: { name: action[0], arguments: JSON.stringify(action[1]) } }] } : { role: "assistant", content: "done" }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
