import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { searchWebTool } from "../tools/searchWebTool";

// ---------- Reuse your existing shapes (kept identical to your debateWorkflow) ----------
const ClaimIn = z.object({
  claim: z.string().describe("The claim or statement to be evaluated."),
});

const Subclaim = z.object({ id: z.string(), text: z.string() });
const Argument = z.object({ subclaim: z.string(), text: z.string() });
const Rebuttal = z.object({ target: z.string(), text: z.string() });

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
  adjustments: z.array(z.object({ reason: z.string(), delta: z.number() })).default([]),
});

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

// ---------- Multi-round shapes ----------
const RoundSummary = z.object({
  round: z.number(),
  verdict: z.string(),
  truthScore: z.number(),
  confidence: z.string(),
  summary: z.string(),
});

const MultiRoundInput = z.object({
  claim: z.string(),
  rounds: z.number().min(1).max(5).default(2),
});
const RoundDetail = z.object({
    round: z.number(),
    proposerOutput: ProposerOut.shape.proposerOutput,
    opponentOutput: OpponentOut.shape.opponentOutput,
    factCheckEvidence: z.array(EvidenceItem),
    judgeGlobal: JudgeGlobal,
    final: FinalOut,
  });

const MultiRoundOutput = z.object({
    verdict: z.string(),
    truthScore: z.number(),
    confidence: z.string(),
    summary: z.string(),
    rounds: z.array(
      z.object({
        round: z.number(),
        verdict: z.string(),
        truthScore: z.number(),
        confidence: z.string(),
        summary: z.string(),
      })
    ),
    transcript: z.array(RoundDetail), // ← NEW
  });

// ---------- Helper to normalize evidence ----------
function normalizeEvidence(
  items: Array<{
    id?: string;
    subclaim: string;
    url: string;
    title?: string;
    snippet?: string;
    summary?: string;
    publishedAt?: string;
    stance?: "support" | "oppose" | "neutral";
    sourceDomain?: string;
    sourceCred?: number;
  }>
): Array<z.infer<typeof EvidenceItem>> {
  return items.map((e, i) => {
    const id = e.id ?? `E${i + 1}`;
    let sourceDomain = e.sourceDomain;
    try {
      sourceDomain = sourceDomain ?? new URL(e.url).hostname.replace(/^www\./, "");
    } catch {}
    const sourceCred =
      e.sourceCred ??
      (sourceDomain?.endsWith(".gov") || sourceDomain?.endsWith(".edu")
        ? 0.9
        : sourceDomain?.includes("wikipedia.org")
        ? 0.7
        : 0.5);
    const stance: "support" | "oppose" | "neutral" = e.stance ?? "neutral";
    const snippet = e.snippet?.slice(0, 400);
    return { ...e, id, sourceDomain, sourceCred, stance, snippet };
  });
}

// ---------- One-round runner (replicates your debateWorkflow steps) ----------
async function runSingleRound({
  claim,
  round,
  mastra,
  runtimeContext,
  previousVerdict,
}: {
  claim: string;
  round: number;
  mastra: any;
  runtimeContext: any;
  previousVerdict?: z.infer<typeof FinalOut>;
}): Promise<{
    final: z.infer<typeof FinalOut>;
    judgeGlobal: z.infer<typeof JudgeGlobal>;
    proposerOutput: z.infer<typeof ProposerOut>["proposerOutput"];
    opponentOutput: z.infer<typeof OpponentOut>["opponentOutput"];
    evidence: Array<z.infer<typeof EvidenceItem>>;
  }> {
  // 1) Proposer
  const proposerAgent = mastra?.getAgent("proposerAgent");
  if (!proposerAgent) throw new Error("proposerAgent not found");

  const propResp = await proposerAgent.generate(
    [
      {
        role: "user",
        content: `Round ${round}. Claim: "${claim}"
${previousVerdict ? `Previous verdict: ${JSON.stringify(previousVerdict, null, 2)}` : ""}
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
  const proposerOut: z.infer<typeof ProposerOut> = {
    claim,
    proposerOutput: propResp.object,
  };

  // 2) Opponent
  const opponentAgent = mastra?.getAgent("opponentAgent");
  if (!opponentAgent) throw new Error("opponentAgent not found");

  const oppResp = await opponentAgent.generate(
    [
      {
        role: "user",
        content: `Round ${round}. Claim: "${claim}"
Proposer: ${JSON.stringify(proposerOut.proposerOutput, null, 2)}
${previousVerdict ? `Previous verdict: ${JSON.stringify(previousVerdict, null, 2)}` : ""}
Return JSON:
{ "rebuttals":[{"target":"S1","text":"..."}] }`,
      },
    ],
    {
      structuredOutput: { schema: z.object({ rebuttals: z.array(Rebuttal) }) },
    }
  );
  const opponentOut: z.infer<typeof OpponentOut> = {
    claim,
    proposerOutput: proposerOut.proposerOutput,
    opponentOutput: oppResp.object,
  };

  // 3) Fact-Check (search + summarize)
  const summarizer = mastra?.getAgent("summarizeURLAgent");
  if (!summarizer) throw new Error("summarizeURLAgent not found");

  // query focuses more narrowly after round 1
  const searchQuery =
    round === 1 || !previousVerdict
      ? claim
      : `${claim} ${previousVerdict.summary?.slice(0, 160) ?? ""}`.trim();

  let searchResults: { results: Array<{ title: string; url: string; snippet?: string }> } = { results: [] };
  try {
    searchResults = await searchWebTool.execute({
      context: { query: searchQuery, maxResults: 3 },
      runtimeContext,
    });
  } catch (err) {
    // continue with empty evidence
  }

  const summarySchema = z.object({ url: z.string().url().optional(), summary: z.string() });

  const summaries = await Promise.all(
    (searchResults.results ?? []).map(async (res, i) => {
      try {
        const resp = await summarizer.generate(
          [
            {
              role: "user",
              content: `Round ${round}. Summarize factual information relevant to the claim "${claim}" from this page.

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
            proposerOut.proposerOutput.subclaims[
              i % proposerOut.proposerOutput.subclaims.length
            ]?.id || "S1",
          url: obj.url || res.url,
          title: res.title || "Untitled Source",
          snippet: (res.snippet || "").slice(0, 400),
          summary: obj.summary,
        };
      } catch {
        return null;
      }
    })
  );

  const evidenceNormalized = normalizeEvidence(
    (summaries.filter(Boolean) as Array<NonNullable<typeof summaries[number]>>) ?? []
  );

  const factOut: z.infer<typeof FactCheckOut> = {
    claim,
    proposerOutput: proposerOut.proposerOutput,
    opponentOutput: opponentOut.opponentOutput,
    factCheckOutput: { evidence: evidenceNormalized },
  };

  // 4) Judge
  const judgeAgent = mastra?.getAgent("judgeAgent");
  if (!judgeAgent) throw new Error("judgeAgent not found");

  const judgeResp = await judgeAgent.generate(
    [
      {
        role: "user",
        content: `Round ${round}. Evaluate the debate and return JSON:
{ "global":{"truthScore": <0-100>, "confidence":"low|moderate|high", "rationale":"...", "adjustments":[{"reason":"...","delta": number}] } }

Claim: "${claim}"
Proposer: ${JSON.stringify(factOut.proposerOutput, null, 2)}
Opponent: ${JSON.stringify(factOut.opponentOutput, null, 2)}
Evidence: ${JSON.stringify(factOut.factCheckOutput, null, 2)}
${previousVerdict ? `Previous verdict: ${JSON.stringify(previousVerdict, null, 2)}` : ""}`,
      },
    ],
    { structuredOutput: { schema: z.object({ global: JudgeGlobal }) } }
  );

  const judgeOut: z.infer<typeof JudgeOut> = {
    claim,
    proposerOutput: factOut.proposerOutput,
    opponentOutput: factOut.opponentOutput,
    factCheckOutput: factOut.factCheckOutput,
    judgeOutput: judgeResp.object,
  };

  // 5) Summarize
  const summarizerAgent = mastra?.getAgent("summarizerAgent");
  if (!summarizerAgent) throw new Error("summarizerAgent not found");

  const finalResp = await summarizerAgent.generate(
    [
      {
        role: "user",
        content: `Round ${round}. Create a concise verdict.

Claim: "${claim}"
Judge: ${JSON.stringify(judgeOut.judgeOutput.global, null, 2)}

Return JSON:
{
  "verdict":"...",
  "truthScore": <number>,
  "confidence":"...",
  "summary":"..."
}`,
      },
    ],
    { structuredOutput: { schema: FinalOut } }
  );

  return {
    final: finalResp.object,
    judgeGlobal: judgeOut.judgeOutput.global,
    proposerOutput: proposerOut.proposerOutput,
    opponentOutput: opponentOut.opponentOutput,
    evidence: factOut.factCheckOutput.evidence,
  };
}

// ---------- The multi-round workflow ----------
const runRounds = createStep({
    id: "run-multi-round",
    description: "Run N iterative debate rounds and aggregate results.",
    inputSchema: MultiRoundInput,
    outputSchema: MultiRoundOutput,
    execute: async ({ inputData, mastra, runtimeContext }) => {
      const roundsArr: Array<z.infer<typeof RoundSummary>> = [];
      const transcript: Array<z.infer<typeof RoundDetail>> = [];
      let previous: z.infer<typeof FinalOut> | undefined;
  
      for (let r = 1; r <= inputData.rounds; r++) {
        const { final, judgeGlobal, proposerOutput, opponentOutput, evidence } =
          await runSingleRound({ claim: inputData.claim, round: r, mastra, runtimeContext, previousVerdict: previous });
  
        roundsArr.push({
          round: r,
          verdict: final.verdict,
          truthScore: final.truthScore,
          confidence: final.confidence,
          summary: final.summary,
        });
  
        transcript.push({
          round: r,
          proposerOutput,
          opponentOutput,
          factCheckEvidence: evidence,
          judgeGlobal,
          final,
        });
  
        previous = final;
      }
  
      const last = roundsArr[roundsArr.length - 1];
      return {
        verdict: last.verdict,
        truthScore: last.truthScore,
        confidence: last.confidence,
        summary: last.summary,
        rounds: roundsArr,
        transcript, // full per-round pipeline
      };
    },
  });

export const multiRoundDebateWorkflow = createWorkflow({
  id: "multi-round-debate",
  inputSchema: MultiRoundInput,
  outputSchema: MultiRoundOutput,
}).then(runRounds);

multiRoundDebateWorkflow.commit();