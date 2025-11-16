import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { searchWebTool } from "../tools/searchWebTool";

// ---------- Reuse your existing shapes (kept identical to th debateWorkflow) ----------
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

const Side = z.enum(["proposer", "opponent"]);

const Exhibit = EvidenceItem.extend({
  side: Side,
  linkedTo: z.array(z.string()).default([]),
});

const InterimDirectives = z.object({
  notes: z.array(z.string()).default([]),
  requests: z.array(z.string()).default([]),
  inadmissible: z.array(z.string()).default([]),
});

const RoundRecord = z.object({
  round: z.number(),
  proposer: z.object({
    subclaims: z.array(Subclaim),
    arguments: z.array(Argument),
    exhibits: z.array(Exhibit),
  }),
  opponent: z.object({
    rebuttals: z.array(Rebuttal),
    exhibits: z.array(Exhibit),
  }),
  judge: z.object({
    global: z.object({
      truthScore: z.number().min(0).max(100),
      confidence: z.enum(["low","moderate","high"]),
      rationale: z.string(),
      adjustments: z.array(z.object({ reason: z.string(), delta: z.number() })).default([]),
    }),
    directives: InterimDirectives,
  }),
  summary: FinalOut,
});

const CaseState = z.object({
  claim: z.string(),
  rounds: z.array(RoundRecord),
  runningScore: z.object({
    proposer: z.number(),
    opponent: z.number(),
  }).default({ proposer: 0, opponent: 0 }),
});

const AdversarialInput = z.object({
  claim: z.string(),
  maxRounds: z.number().min(1).max(6).default(3),
  // optional stopping knobs
  stopConfidence: z.enum(["high","moderate","low"]).default("high"),
  minDelta: z.number().default(2), // stop if score change < 2
});

const AdversarialOutput = z.object({
  final: FinalOut,
  caseState: CaseState,
});

// --- helpers ---
function normalize(items: Array<z.infer<typeof EvidenceItem>>): Array<z.infer<typeof Exhibit>> {
    return items.map((e, i) => {
      let sourceDomain = e.sourceDomain;
      try { sourceDomain = sourceDomain ?? new URL(e.url).hostname.replace(/^www\./, ""); } catch {}
  
      const domainBoost: Record<string, number> = {
        "reuters.com": 0.85, "bbc.com": 0.85, "nytimes.com": 0.85,
        "abcnews.go.com": 0.8, "pbs.org": 0.8, "apnews.com": 0.85
      };
  
      const sourceCred =
        e.sourceCred ??
        (domainBoost[sourceDomain ?? ""] ??
         ((sourceDomain?.endsWith(".gov") || sourceDomain?.endsWith(".edu")) ? 0.9 :
          (sourceDomain?.includes("wikipedia.org") ? 0.7 : 0.5)));
  
      return {
        ...e,
        id: e.id ?? `E${i+1}`,
        sourceDomain,
        sourceCred,
        side: "proposer",  // will be overwritten by caller
        linkedTo: [],
      };
    });
  }

async function gatherExhibits({
  side, query, summarizer, runtimeContext,
}: {
  side: "proposer" | "opponent";
  query: string;
  summarizer: any;
  runtimeContext: any;
}): Promise<Array<z.infer<typeof Exhibit>>> {
  let results: { results: Array<{ title: string; url: string; snippet?: string }> } = { results: [] };
  try {
    results = await searchWebTool.execute({
      context: { query, maxResults: 3 },
      runtimeContext,
    });
  } catch {}

  const summarySchema = z.object({ url: z.string().url().optional(), summary: z.string() });

  const summaries = await Promise.all(
    (results.results ?? []).map(async (r, i) => {
      try {
        const resp = await summarizer.generate(
          [{
            role: "user",
            content: `Summarize factual content relevant to: "${query}"\nURL: ${r.url}\nTitle: ${r.title}\nSnippet: ${r.snippet ?? ""}\nReturn JSON: { "url": "<same>", "summary": "<3-4 sentences>" }`,
          }],
          { structuredOutput: { schema: summarySchema } }
        );
        const obj = resp.object ?? { url: r.url, summary: resp.text || "" };
        return {
          id: `E${i+1}`,
          subclaim: "S1", // you can map to a real subclaim id if you wish
          url: obj.url || r.url,
          title: r.title || "Untitled",
          snippet: (r.snippet || "").slice(0,400),
          summary: obj.summary,
          publishedAt: undefined,
          stance: "neutral",
          sourceDomain: undefined,
          sourceCred: undefined,
          side,
          linkedTo: [],
        } as z.infer<typeof Exhibit>;
      } catch {
        return null;
      }
    })
  );

  const rawEvidenceItems: Array<z.infer<typeof EvidenceItem>> =
  (summaries.filter(Boolean) as Array<{
    id: string; subclaim: string; url: string; title?: string; snippet?: string;
    summary?: string; publishedAt?: string; stance: "support"|"oppose"|"neutral";
    sourceDomain?: string; sourceCred?: number;
  }>) ?? [];

    return normalize(rawEvidenceItems).map(e => ({ ...e, side }));
}

// --- one adversarial round ---
async function runAdversarialRound({
  claim, round, mastra, runtimeContext, previous,
}: {
  claim: string;
  round: number;
  mastra: any;
  runtimeContext: any;
  previous?: z.infer<typeof RoundRecord>;
}): Promise<z.infer<typeof RoundRecord>> {

  const proposer = mastra.getAgent("proposerAgent");
  const opponent  = mastra.getAgent("opponentAgent");
  const summarizer = mastra.getAgent("summarizeURLAgent");
  const judge     = mastra.getAgent("judgeAgent");
  const finalizer = mastra.getAgent("summarizerAgent");

  if (!proposer || !opponent || !summarizer || !judge || !finalizer) {
    throw new Error("Missing agents for adversarial round.");
  }

  // Proposer move
  const propResp = await proposer.generate(
    [{
      role: "user",
      content: `Round ${round}. Claim: "${claim}"${previous ? `\nJudge notes from last round: ${JSON.stringify(previous.judge.directives, null, 2)}` : ""}
Return JSON: {"subclaims":[{"id":"S1","text":"..."}], "arguments":[{"subclaim":"S1","text":"..."}]}`,
    }],
    { structuredOutput: { schema: z.object({ subclaims: z.array(Subclaim), arguments: z.array(Argument) }) } }
  );

  const propExhibits = await gatherExhibits({
    side: "proposer",
    query: `${claim} ${
      (propResp.object.subclaims as Array<z.infer<typeof Subclaim>>)
        .map((s: z.infer<typeof Subclaim>) => s.text)
        .join(" ")
    }`.slice(0, 300),
    summarizer,
    runtimeContext,
  });

  // Opponent move (rebut + counter-exhibits)
  const oppResp = await opponent.generate(
    [{
      role: "user",
      content: `Round ${round}. Claim: "${claim}"
Proposer subclaims: ${JSON.stringify(propResp.object.subclaims, null, 2)}
Return JSON: { "rebuttals":[{"target":"S1","text":"..."}] }`,
    }],
    { structuredOutput: { schema: z.object({ rebuttals: z.array(Rebuttal) }) } }
  );

  const oppExhibits = await gatherExhibits({
    side: "opponent",
    query: `${claim} critique ${
      (propResp.object.subclaims as Array<z.infer<typeof Subclaim>>)
        .map((s: z.infer<typeof Subclaim>) => s.text)
        .join(" ")
    }`.slice(0, 300),
    summarizer,
    runtimeContext,
  });
  function reseatIds(exhibits: Array<z.infer<typeof Exhibit>>) {
    return exhibits.map((e, i) => ({ ...e, id: `E${i+1}` }));
  }

  // Judge (interim)
  const allExhibits = reseatIds([...propExhibits, ...oppExhibits]);
  const judgeResp = await judge.generate(
    [{
      role: "user",
      content:
  `Round ${round}. Evaluate this round and provide directives.
  
  Claim: "${claim}"
  Proposer: ${JSON.stringify({ subclaims: propResp.object.subclaims, arguments: propResp.object.arguments }, null, 2)}
  Opponent: ${JSON.stringify(oppResp.object, null, 2)}
  Exhibits: ${JSON.stringify(allExhibits, null, 2)}
  
  Return JSON:
  {
    "global":{"truthScore":0-100,"confidence":"low|moderate|high","rationale":"...","adjustments":[{"reason":"...","delta":number}]},
    "directives":{"notes":["..."],"requests":["..."],"inadmissible":["E2","E4"]}
  }`
    }],
    { structuredOutput: { schema: z.object({ global: JudgeGlobal, directives: InterimDirectives }) } }
  );

  // Remove inadmissible exhibits if judge flagged them
// After judgeResp
const inadmissible = new Set(judgeResp.object.directives.inadmissible ?? []);

const kept = allExhibits.filter(e => !inadmissible.has(e.id!));
const filteredProp = kept.filter(e => e.side === "proposer");
const filteredOpp  = kept.filter(e => e.side === "opponent");

  // Round summary
  const summaryResp = await finalizer.generate(
    [{
      role: "user",
      content: `Round ${round}. Create a concise verdict for this round.
Judge: ${JSON.stringify(judgeResp.object.global, null, 2)}
Return JSON: {"verdict":"...","truthScore":<num>,"confidence":"...","summary":"..."}`,
    }],
    { structuredOutput: { schema: FinalOut } }
  );

  return {
    round,
    proposer: {
      subclaims: propResp.object.subclaims,
      arguments: propResp.object.arguments,
      exhibits: filteredProp,
    },
    opponent: {
      rebuttals: oppResp.object.rebuttals,
      exhibits: filteredOpp,
    },
    judge: judgeResp.object,
    summary: summaryResp.object,
  };
}

// --- the workflow step (loop) ---
const adversarialDebate = createStep({
  id: "adversarial-debate",
  description: "Run an adversarial, judge-steered debate until stop.",
  inputSchema: AdversarialInput,
  outputSchema: AdversarialOutput,
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const state: z.infer<typeof CaseState> = { claim: inputData.claim, rounds: [], runningScore: { proposer:0, opponent:0 } };
    let lastScore: number | null = null;

    for (let r = 1; r <= inputData.maxRounds; r++) {
      const prev = state.rounds[state.rounds.length - 1];
      const roundRec = await runAdversarialRound({
        claim: inputData.claim,
        round: r,
        mastra,
        runtimeContext,
        previous: prev,
      });
      state.rounds.push(roundRec);

      // stopping conditions
      const score = roundRec.summary.truthScore;
      if (lastScore !== null && Math.abs(score - lastScore) < inputData.minDelta) break;
      if (roundRec.judge.global.confidence === inputData.stopConfidence) break;
      lastScore = score;
    }

    const last = state.rounds[state.rounds.length - 1].summary;
    return {
      final: last,
      caseState: state,
    };
  },
});

export const adversarialDebateWorkflow = createWorkflow({
  id: "adversarial-debate",
  inputSchema: AdversarialInput,
  outputSchema: AdversarialOutput,
}).then(adversarialDebate);

adversarialDebateWorkflow.commit();