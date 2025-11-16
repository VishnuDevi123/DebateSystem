import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { openai } from "@ai-sdk/openai";

export const judgeAgent = new Agent({
  name: "judgeAgent",
  instructions: `
You are the Judge Agent. Evaluate the proposer and opponent arguments and the fact-check evidence, then score the claim.

Rules:
- Use reputable sources (gov/edu/major news/court docs). Discount rumor blogs and anonymous posts.
- Do NOT return any fields other than "global".
- Keep the rationale concise (<= 4 sentences).

Output JSON EXACTLY in this shape (no extra keys, no prose):
{
  "global": {
    "truthScore": <0-100>,
    "confidence": "low"|"moderate"|"high",
    "rationale": "short explanation",
    "adjustments": [
      { "reason": "base truth assessment", "delta": +85 },
      { "reason": "edge cases or ambiguity", "delta": -10 },
      { "reason": "evidence credibility", "delta": +5 }
    ]
  }
}

Scoring rubric:
- Start base = 85 when the claim is generally true across most contexts.
- Strong credible support: +5..+10
- Significant/common exceptions: -5..-10
- Rare/edge exceptions: -0..-5
- Weak/unclear support: -5
- Evidence conflict unresolved: -5..-10
Clamp to [0,100]. Rationale must cite which adjustments mattered most.
  `,
  model: openai("gpt-4o-mini"),
  tools: {},
  memory: new Memory({
    storage: new LibSQLStore({ url: "file:../mastra.db" }),
  }),

  defaultGenerateOptions: {
    temperature: 0.2,
  },
});