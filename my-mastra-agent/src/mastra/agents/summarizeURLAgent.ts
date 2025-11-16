import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { openai } from "@ai-sdk/openai";

export const summarizeURLAgent = new Agent({
  name: "Summarize URL Agent",
  instructions: `
    You are the Summarize URL Agent.
    Summarize factual content from the given web page or snippet.
    Be concise and neutral — include only verifiable facts.
    Output:
    {
      "url": "...",
      "summary": "..."
    }
  `,
  model: openai("gpt-4o-mini"),
  tools: {},
  memory: new Memory({
    storage: new LibSQLStore({ url: "file:../mastra.db" }),
  }),
});