import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { searchWebTool } from "../tools/searchWebTool";

// ----- Shared shapes -----
const ClaimIn = z.object({
  claim: z.string().describe("The claim or statement to be evaluated."),
});

const Subclaim = z.object({ id: z.string(), text: z.string() });
const Argument = z.object({ subclaim: z.string(), text: z.string() });
const Rebuttal = z.object({ target: z.string(), text: z.string() });
// ----- Shared shapes -----
const EvidenceItem = z.object({
  id: z.string().optional(),
  subclaim: z.string(),
  url: z.string().url(),
  title: z.string().optional(),
  snippet: z.string().max(400).optional(),
  summary: z.string().optional(), 
  publishedAt: z.string().optional(),
  stance: z.enum(["support", "oppose", "neutral"]).default("neutral"), 
  sourceDomain: z.string().optional(),
  sourceCred: z.number().min(0).max(1).optional(),
});

const JudgeGlobal = z.object({
  truthScore: z.number().min(0).max(100),
  confidence: z.enum(["low", "moderate", "high"]),
  rationale: z.string(),
  adjustments: z
    .array(z.object({ reason: z.string(), delta: z.number() }))
    .default([]),
});

// accumulate a context object as we go:
const ProposerOut = z.object({
  proposerOutput: z.object({
    subclaims: z.array(Subclaim),
    arguments: z.array(Argument),
  }),
  claim: z.string(),
});

const OpponentOut = z.object({
  proposerOutput: ProposerOut.shape.proposerOutput,
  opponentOutput: z.object({
    rebuttals: z.array(Rebuttal),
  }),
  claim: z.string(),
});

const FactCheckOut = z.object({
  proposerOutput: ProposerOut.shape.proposerOutput,
  opponentOutput: OpponentOut.shape.opponentOutput,
  factCheckOutput: z.object({
    evidence: z.array(EvidenceItem),
  }),
  claim: z.string(),
});

const JudgeOut = z.object({
  proposerOutput: ProposerOut.shape.proposerOutput,
  opponentOutput: OpponentOut.shape.opponentOutput,
  factCheckOutput: FactCheckOut.shape.factCheckOutput,
  judgeOutput: z.object({ global: JudgeGlobal }),
  claim: z.string(),
});

const FinalOut = z.object({
  verdict: z.string(),
  truthScore: z.number(),
  confidence: z.string(),
  summary: z.string(),
});

// 1) Proposer
const proposeArguments = createStep({
  id: "propose-arguments",
  description: "Generate subclaims and supporting arguments for a claim.",
  inputSchema: ClaimIn,
  outputSchema: ProposerOut,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent("proposerAgent");
    if (!agent) throw new Error("proposerAgent not found");

    const response = await agent.generate(
      [
        {
          role: "user",
          content: `Claim: "${inputData.claim}"
Respond ONLY in valid JSON. No commentary, no markdown.
Return JSON:
{
  "subclaims":[{"id":"S1","text":"..."}],
  "arguments":[{"subclaim":"S1","text":"..."}]
}`,
        },
      ],
      {
        structuredOutput: {
          schema: z.object({
            subclaims: z.array(Subclaim),
            arguments: z.array(Argument),
          }),
        },
      }
    );

    return {
      claim: inputData.claim,
      proposerOutput: response.object,
    };
  },
});

// 2) Opponent
const opposeArguments = createStep({
  id: "oppose-arguments",
  description: "Generate counterarguments to the proposer's subclaims.",
  inputSchema: ProposerOut,
  outputSchema: OpponentOut,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent("opponentAgent");
    if (!agent) throw new Error("opponentAgent not found");

    const response = await agent.generate(
      [
        {
          role: "user",
          content: `Claim: "${inputData.claim}"
Proposer: ${JSON.stringify(inputData.proposerOutput, null, 2)}
Return JSON:
{ "rebuttals":[{"target":"S1","text":"..."}] }`,
        },
      ],
      {
        structuredOutput: {
          schema: z.object({
            rebuttals: z.array(Rebuttal),
          }),
        },
      }
    );

    return {
      claim: inputData.claim,
      proposerOutput: inputData.proposerOutput,
      opponentOutput: response.object,
    };
  },
});

// 3) Fact-Check (placeholder; tools later)
const factCheck = createStep({
  id: "fact-check",
  description: "Retrieve factual web evidence and summarize it for each subclaim.",
  inputSchema: OpponentOut,
  outputSchema: FactCheckOut,

  // NOTE: add runtimeContext to the signature
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const summarizer = mastra?.getAgent("summarizeURLAgent");
    if (!summarizer) throw new Error("summarizeURLAgent not found");

    // 1) Search using the tool directly — include runtimeContext
    let searchResults: { results: Array<{ title: string; url: string; snippet?: string }> } = { results: [] };
    try {
      searchResults = await searchWebTool.execute({
        context: { query: inputData.claim, maxResults: 3 },
        runtimeContext, // REQUIRED by ToolExecutionContext
      });
    } catch (err) {
      console.warn("searchWebTool failed:", err);
      return {
        claim: inputData.claim,
        proposerOutput: inputData.proposerOutput,
        opponentOutput: inputData.opponentOutput,
        factCheckOutput: { evidence: [] },
      };
    }

    if (!searchResults?.results?.length) {
      return {
        claim: inputData.claim,
        proposerOutput: inputData.proposerOutput,
        opponentOutput: inputData.opponentOutput,
        factCheckOutput: { evidence: [] },
      };
    }

    // 2) Summarize each result in parallel using the summarizer agent
    const summarySchema = z.object({
      url: z.string().url().optional(),
      summary: z.string(),
    });

    const summaries = await Promise.all(
      searchResults.results.map(async (res, i) => {
        try {
          const resp = await summarizer.generate(
            [
              {
                role: "user",
                content: `Summarize factual information relevant to the claim "${inputData.claim}" from this page.

URL: ${res.url}
Title: ${res.title || "Untitled"}
Snippet: ${res.snippet || ""}

Return JSON:
{ "url": "<same url>", "summary": "<3-4 sentence factual summary>" }`,
              },
            ],
            { structuredOutput: { schema: summarySchema } }
          );

          const obj = resp.object ?? { url: res.url, summary: resp.text || "No summary available." };

          return {
            id: `E${i + 1}`,
            subclaim:
              inputData.proposerOutput.subclaims[
                i % inputData.proposerOutput.subclaims.length
              ]?.id || "S1",
            url: obj.url || res.url,
            title: res.title || "Untitled Source",
            snippet: (res.snippet || "").slice(0, 400),
            summary: obj.summary,
          };
        } catch (e) {
          console.warn(`Summarization failed for ${res.url}:`, e);
          return null;
        }
      })
    );

    const evidenceList = summaries.filter((x): x is NonNullable<typeof x> => !!x);

    // 3) Normalize (domain + naive credibility + ensure stance)
    const normalized = evidenceList.map((e) => {
      let sourceDomain: string | undefined;
      try {
        sourceDomain = new URL(e.url).hostname.replace(/^www\./, "");
      } catch {}
      const sourceCred =
        sourceDomain?.endsWith(".gov") || sourceDomain?.endsWith(".edu")
          ? 0.9
          : sourceDomain?.includes("wikipedia.org")
          ? 0.7
          : 0.5;
      const stance: "support" | "oppose" | "neutral" = "neutral"; // placeholder
      return {
        ...e,
        sourceDomain,
        sourceCred,
        stance, // ensure schema satisfaction
      };
    });

    // 4) Return structured result
    return {
      claim: inputData.claim,
      proposerOutput: inputData.proposerOutput,
      opponentOutput: inputData.opponentOutput,
      factCheckOutput: { evidence: normalized },
    };
  },
});

// 4) Judge
const judgeDebate = createStep({
  id: "judge-debate",
  description: "Evaluate logical validity and evidence balance.",
  inputSchema: FactCheckOut,
  outputSchema: JudgeOut,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent("judgeAgent");
    if (!agent) throw new Error("judgeAgent not found");

    const response = await agent.generate(
      [
        {
          role: "user",
          content: `Evaluate the debate and return JSON:
            { "global":{"truthScore": <0-100>, "confidence":"...", "rationale":"..."} }

            Claim: "${inputData.claim}"
            Proposer: ${JSON.stringify(inputData.proposerOutput, null, 2)}
            Opponent: ${JSON.stringify(inputData.opponentOutput, null, 2)}
            Evidence: ${JSON.stringify(inputData.factCheckOutput, null, 2)}
          `,
        },
      ],
      {
        structuredOutput: {
          schema: z.object({
            global: JudgeGlobal,
          }),
        },
      }
    );

    return {
      claim: inputData.claim,
      proposerOutput: inputData.proposerOutput,
      opponentOutput: inputData.opponentOutput,
      factCheckOutput: inputData.factCheckOutput,
      judgeOutput: response.object,
    };
  },
});

// 5) Summarize
const summarizeVerdict = createStep({
  id: "summarize-verdict",
  description: "Summarize the Judge’s decision into a final verdict JSON.",
  inputSchema: judgeDebate.outputSchema, // reuse the Zod schema above
  outputSchema: FinalOut,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent("summarizerAgent");
    if (!agent) throw new Error("summarizerAgent not found");

    const response = await agent.generate(
      [
        {
          role: "user",
          content: `Create a concise verdict.

Claim: "${inputData.claim}"
Judge: ${JSON.stringify(inputData.judgeOutput.global, null, 2)}

Return JSON:
{
  "verdict":"...",
  "truthScore": <number>,
  "confidence":"...",
  "summary":"..."
}`,
        },
      ],
      {
        structuredOutput: {
          schema: FinalOut,
        },
      }
    );

    return response.object;
  },
});

// ----- Build workflow -----
export const debateWorkflow = createWorkflow({
  id: "debate-workflow",
  inputSchema: ClaimIn,
  outputSchema: FinalOut,
})
  .then(proposeArguments)
  .then(opposeArguments)
  .then(factCheck)
  .then(judgeDebate)
  .then(summarizeVerdict);

debateWorkflow.commit();
