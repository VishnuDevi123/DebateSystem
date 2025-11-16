import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { openai } from "@ai-sdk/openai";
import { searchWebTool } from "../tools/searchWebTool";

export const factCheckerAgent = new Agent({
  name: "Fact Checker Agent",
  instructions: `
    You are the Fact Checker Agent.
    - Use the "search-web" tool to find factual sources for each subclaim.
    - For now, you only return the links and snippets.
    - Later, another agent (SummarizeURLAgent) will expand on these.
    Return JSON:
    {
      "evidence":[
        {"subclaim":"S1","url":"https://...","title":"...","snippet":"...","stance":"support"}
      ]
    }
  `,
  model: openai("gpt-4o"),
  tools: { searchWebTool },
  memory: new Memory({
    storage: new LibSQLStore({ url: "file:../mastra.db" }),
  }),
});