# Adversarial Debate Workflow  
**Mastra Multi-Agent System**

A multi-round adversarial debate system built with Mastra, where specialized AI agents
argue, rebut, evaluate evidence, and converge on a scored verdict with confidence.


## Overview

This project implements an automated **adversarial debate workflow** using multiple AI agents,
each with a clearly defined role. The system is designed to evaluate claims rigorously through
structured argumentation, evidence gathering, rebuttal, and judgment.

The workflow runs for multiple rounds and **terminates automatically** when:
- Confidence reaches a predefined threshold, or
- The score delta between rounds falls below a minimum value

The final output is a **fully structured JSON object** suitable for downstream use in analysis,
evaluation pipelines, or user-facing applications.

## Agents and Responsibilities

The system consists of the following agents:

- **Proposer Agent**  
  Builds the initial claim, defends it, and responds to rebuttals.

- **Opponent Agent**  
  Challenges the claim, identifies weaknesses, and presents counter-arguments.

- **Judge Agent**  
  Evaluates arguments, filters inadmissible evidence, assigns truth scores,
  provides rationale, and issues directives.

- **SummarizeURL Agent**  
  Fetches and summarizes evidence from URLs for use in debate rounds.

- **Summarizer Agent**  
  Produces round-level verdicts and a final summary of the debate.

Each agent operates independently but contributes to a shared case state.

## Debate Workflow Logic

Each debate round follows a structured sequence:

1. Claim evaluation and argument generation
2. Evidence gathering from web sources (optional)
3. Evidence filtering (inadmissible or low-credibility sources removed)
4. Rebuttal and counter-rebuttal
5. Judge scoring and rationale
6. Confidence and score-delta evaluation

The workflow halts automatically when stopping conditions are met.

## Prerequisites

Ensure the following are installed:

- **Node.js** ≥ 18
- **npm** or **yarn**

Install the Mastra development tools:

```bash
npm create mastra@latest
```

## Project Setup

### Initialize a new Mastra project:

```bash
cd adversarial-debate
```

#### Install dependencies:

```bash
npm install
```

## Project Structure

### Agents (src/agents/)
- proposerAgent.ts
- opponentAgent.ts
- judgeAgent.ts
- summarizeURLAgent.ts
- summarizerAgent.ts

### Workflows (src/workflows/)
- multiDebate.ts: 
Main multi-round adversarial debate workflow

### Tools (src/tools/)
- searchWebTool.ts: 
Used for live evidence retrieval


### Create a .env file in the project root:

``` bash
OPENAI_API_KEY=your_openai_api_key
SERPER_API_KEY=your_serper_api_key
```

## Notes:
- SERPER_API_KEY is required for the Agent to gather the secondary sources
- Required only if agents need live, up-to-date web evidence

Running in Development

Start the Mastra development runner:

```bash
npm run dev
```

Run the workflow from the Mastra Playground or CLI:

``` bash
mastra run adversarial-debate --input {
  "claim": "Superhero movies all have the same basic plot",
  "maxRounds": 3,
  "stopConfidence": "high",
  "minDelta": 2
}
```
## Output Format

The workflow returns a structured JSON object containing:
	•	final - final verdict summary
	•	caseState - full debate history across all rounds
	•	truthScore - numerical assessment of claim validity
	•	confidence - qualitative confidence level
	•	verdict - human-readable outcome

Example output

``` bash
{
  "judge": {
    "global": {
      "truthScore": 70,
      "confidence": "moderate",
      "rationale": "While many superhero movies follow common narrative structures, notable variations challenge the claim of uniformity.",
      "adjustments": [
        { "reason": "base truth assessment", "delta": 85 },
        { "reason": "edge cases or ambiguity", "delta": -10 },
        { "reason": "evidence credibility", "delta": -5 }
      ]
    },
    "directives": {
      "notes": [
        "The proposer identified common narrative patterns.",
        "The opponent highlighted meaningful genre variation."
      ],
      "requests": [
        "Provide more examples of films that deviate from standard structures."
      ],
      "inadmissible": ["E2", "E4"]
    }
  },
  "summary": {
    "verdict": "Mostly true",
    "truthScore": 70,
    "confidence": "moderate"
  }
}
```
## Configuration Controls

The debate behavior can be tuned using input parameters:
- maxRounds – maximum number of debate rounds
- stopConfidence – confidence level required to halt early
- minDelta – minimum score change between rounds to continue

These controls allow balancing debate depth against runtime cost.

## Developer Tips
- Use mastra dev for live agent debugging
- Extend agent prompts for domain-specific reasoning
- Modify the Judge Agent to:
- Change scoring logic
- Add stricter evidence admissibility rules
- Add additional tools:
- Fact-checking APIs using the Mastra's swagger UI
- Source credibility scoring
- Citation tracking

## Why This Project Is Technically Interesting
- Multi-agent coordination: 
Independent agents collaborate and compete within a shared state.
- Automated stopping conditions: 
Prevents unnecessary rounds and reduces compute cost.
- Explainable scoring: 
Every truth score is backed by a rationale and explicit adjustments.
- Evidence governance: 
Weak sources are filtered before influencing outcomes.
- Composable design: 
Agents, tools, and workflows can be reused across domains.

## Future Enhancements
- Planned improvements include:
- Cross-round memory weighting for long debates
- Source credibility scoring models
- Citation confidence tracking
- Domain-specific judge profiles (legal, medical, policy)
- Multi-claim batch debate execution
- Visualization layer for debate progression and score deltas


## Use Cases
 - Claim verification and fact analysis
 - Policy and ethics debate simulation
 - Research assistance and literature review
 - Educational tools for critical thinking
 - Automated argument evaluation pipelines



## IMPORTANT!!!
This system is designed for structured reasoning and evaluation, not open-ended chat.
It is best suited for scenarios where transparency, scoring rationale, and evidence quality matter.
