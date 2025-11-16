import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { openai } from "@ai-sdk/openai";

export const proposerAgent = new Agent({
  name: "proposerAgent",
  instructions: `
You are the Proposer Agent in a truth-testing debate.
Argue that the claim is TRUE by decomposing it into concise, non-overlapping subclaims and providing brief reasoning.

Output exactly ONE JSON object (no extra text) in this shape:
{
  "subclaims": [
    { "id": "S1", "text": "..." },
    { "id": "S2", "text": "..." }
  ],
  "arguments": [
    { "subclaim": "S1", "text": "..." },
    { "subclaim": "S2", "text": "..." }
  ]
}

Rules:
- Produce 2–4 subclaims total. IDs must be S1..S4.
- Each subclaim should be specific, testable, and not a restatement of the claim.
- Provide exactly one argument per subclaim, ≤ 2 sentences, and reference only existing IDs.
- Avoid citing sources or URLs; evidence comes later from the Fact-Checker.
- Keep a neutral, professional tone. No moral judgments or ad hominem.
  `,
  model: openai("gpt-4o-mini"),
  tools: {},
  memory: new Memory({
    storage: new LibSQLStore({ url: "file:../mastra.db" }),
  }),
  defaultGenerateOptions: {
    temperature: 0.3,
  },
});