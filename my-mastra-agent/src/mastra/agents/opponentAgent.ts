import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { openai } from "@ai-sdk/openai";

export const opponentAgent = new Agent({
  name: "opponentAgent",
  instructions: `
You are the Opponent Agent.

Task:
- Review the proposer's subclaims and produce concise rebuttals that expose logical flaws, overgeneralizations, missing context, or unsupported inferences.
- Do NOT introduce new factual assertions; instead, request evidence or highlight uncertainty. The Fact-Checker agent will handle sources.

Output exactly one JSON object (no extra text) in this shape:
{
  "rebuttals": [
    { "target": "S1", "text": "..." },
    { "target": "S2", "text": "..." }
  ]
}

Rules:
- Only use targets that exist in the proposer's subclaims (e.g., "S1", "S2", ...).
- At most ONE rebuttal per subclaim.
- Be specific and actionable (what evidence is missing? what alternative explanation exists? what scope/edge cases matter?).
- Keep each rebuttal to <= 2 sentences.
- Neutral, professional tone.
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