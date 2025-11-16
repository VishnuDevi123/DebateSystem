import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

// Workflows
import { debateWorkflow } from "./workflows/debateWorkflow";

// Agents
import { proposerAgent } from "./agents/proposerAgent";
import { opponentAgent } from "./agents/opponentAgent";
import { factCheckerAgent } from "./agents/factCheckerAgent";
import { judgeAgent } from "./agents/judgeAgent";
import { summarizerAgent } from "./agents/summarizerAgent";
import { summarizeURLAgent } from "./agents/summarizeURLAgent";

// Tools
import { multiRoundDebateWorkflow } from "./workflows/multiRoundDebateWorkflow";
import { adversarialDebateWorkflow } from "./workflows/multiDebate";
/**
 * Storage:
 * - ":memory:" for hackathon speed
 * - switch to file-backed LibSQL via env: MASTRA_DB=file:../mastra.db
 *   (path is relative to .mastra/output)
 */
const storageUrl = process.env.MASTRA_DB ?? ":memory:";

export const mastra = new Mastra({
  // Register only the debate workflow
  workflows: { debateWorkflow, multiRoundDebateWorkflow, adversarialDebateWorkflow},
  

  // Register debate agents (keys here are the agentIds you’ll use via HTTP)
  agents: {
    proposerAgent,
    opponentAgent,
    factCheckerAgent,
    summarizeURLAgent,
    judgeAgent,
    summarizerAgent,
  },

  storage: new LibSQLStore({ url: storageUrl }),
  logger: new PinoLogger({ name: "Mastra" }),

  // Telemetry is deprecated per scaffold comment – keep disabled
  telemetry: { enabled: false },

  // Observability traces enabled for Playground/Swagger
  observability: { default: { enabled: true } },
});