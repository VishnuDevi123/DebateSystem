Adversarial Debate Workflow (Mastra Multi-Agent System)

This project implements a multi-round adversarial debate system using Mastra, where AI agents act as:
	•	Proposer Agent – builds and defends the claim
	•	Opponent Agent – rebuts and challenges the claim
	•	Judge Agent – evaluates arguments, assigns truth scores, and issues directives
	•	SummarizeURL Agent – summarizes evidence from URLs
	•	Summarizer Agent – produces round verdicts and final summaries

Each round includes evidence gathering, filtering (inadmissible sources), and a scoring rationale with confidence levels.
The workflow automatically stops when confidence is high or score delta falls below a threshold.


1. Prerequisites

Ensure you have the following installed:

Node.js >= 18
npm or yarn

Install the Mastra dev:

npm create mastra@latest


2. Project Setup

Clone or create a Mastra project:

npx mastra init adversarial-debate
cd adversarial-debate

Install dependencies:

npm install

3. Add Your Agents and Workflow

Inside src/agents/:
	•	proposerAgent.ts
	•	opponentAgent.ts
	•	judgeAgent.ts
	•	summarizeURLAgent.ts
	•	summarizerAgent.ts

Inside src/workflows/:
	•	multiDebate.ts or adversarialDebateWorkflow (main multi-round workflow)

Inside src/tools/:
	•	searchWebTool.ts (used for live evidence retrieval)

4. Environment Variables

Create a .env file in the project root:
OPENAI_API_KEY=<your_openai_api_key>
SERPER_API_KEY=<your_serper_api_key> # optional but if need latest info then required for the agent to fecth latest infomation from online


5. Run in Development

Start the local Mastra agent runner:

npm run dev

Run the workflow manually from GUI(Mastra playground):

mastra run adversarial-debate --input {
    "claim": "Superhero movies all have the same basic plot",
    "maxRounds": 3,
    "stopConfidence": "high",
    "minDelta": 2
  },

6. Output

The workflow returns a full structured JSON object:
	•	final – round verdict summary
	•	caseState – all rounds, evidence, rebuttals, judge reasoning
	•	truthScore, confidence, and verdict fields for final reporting
Example out put:

"judge": {
            "global": {
              "truthScore": 70,
              "confidence": "moderate",
              "rationale": "While many superhero movies do follow common narrative structures like the hero's journey, the opponent's arguments highlight significant variations in themes and character dynamics that challenge the claim of uniformity. The adjustments reflect the strong base truth of common plot elements, but acknowledge the diversity within the genre.",
              "adjustments": [
                {
                  "reason": "base truth assessment",
                  "delta": 85
                },
                {
                  "reason": "edge cases or ambiguity",
                  "delta": -10
                },
                {
                  "reason": "evidence credibility",
                  "delta": -5
                }
              ]
            },
            "directives": {
              "notes": [
                "The proposer provided valid examples of common structures in superhero films.",
                "The opponent effectively pointed out the diversity and exceptions within the genre."
              ],
              "requests": [
                "Provide more specific examples of superhero films that deviate from the common plot structures.",
                "Include statistical analysis or surveys on audience perceptions of superhero movie plots."
              ],
              "inadmissible": [
                "E2",
                "E4"
              ]
            }
          },
          "summary": {
            "verdict": "Mostly true",
            "truthScore": 70,
            "confidence": "moderate",
            "summary": "Many superhero movies generally follow common narrative structures, but there are significant variations in themes and character dynamics that challenge the notion of uniformity within the genre."
          }


7. Developer Tips
	•	Use mastra dev for live agent debugging.
	•	Adjust the minDelta or stopConfidence in workflow input to control how many rounds run.
	•	Extend judgeAgent or proposerAgent prompts for domain-specific logic.
	•	Add more tools (e.g., fact-check APIs, credibility scoring) for better realism.
