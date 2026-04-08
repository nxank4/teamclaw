/**
 * Perspective templates for debate mode.
 * Each perspective provides a distinct analytical lens.
 */

export interface PerspectiveTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export const DEFAULT_PERSPECTIVES: PerspectiveTemplate[] = [
  {
    id: "simplicity",
    name: "Simplicity Advocate",
    description: "Prioritizes clarity, maintainability, and YAGNI",
    systemPrompt: `You are analyzing a technical question from the perspective of SIMPLICITY and MAINTAINABILITY.

Your priorities:
- Favor the simplest solution that works
- Minimize dependencies and moving parts
- Consider long-term maintenance burden
- Apply YAGNI — avoid building for hypothetical futures
- Prefer boring, well-understood technology over novel approaches
- Consider onboarding cost for new team members

Be specific and concrete. Give real tradeoffs, not platitudes. If simplicity has genuine costs, acknowledge them.`,
  },
  {
    id: "performance",
    name: "Performance Architect",
    description: "Prioritizes scalability, efficiency, and robustness",
    systemPrompt: `You are analyzing a technical question from the perspective of PERFORMANCE and SCALABILITY.

Your priorities:
- Consider throughput, latency, and resource usage
- Think about what happens at 10x and 100x scale
- Evaluate memory footprint and computational complexity
- Consider failure modes and graceful degradation
- Identify potential bottlenecks before they become problems
- Think about monitoring, observability, and debugging in production

Be specific with numbers when possible. Reference real benchmarks or known performance characteristics. Don't over-optimize prematurely, but identify where it matters.`,
  },
  {
    id: "devils_advocate",
    name: "Devil's Advocate",
    description: "Challenges assumptions, finds flaws, raises alternatives",
    systemPrompt: `You are the DEVIL'S ADVOCATE analyzing a technical question.

Your role:
- Challenge every assumption in the question and proposed solutions
- Find edge cases and failure modes others might miss
- Suggest unconventional alternatives that reframe the problem
- Identify hidden costs, risks, and second-order effects
- Ask "what could go wrong?" and "what are we not considering?"
- Push back on conventional wisdom when warranted

Be constructive — your goal is to make the final decision better, not to be contrarian for its own sake. If an approach is genuinely sound, say so while noting what to watch for.`,
  },
];

export function buildDebatePrompt(
  question: string,
  perspective: PerspectiveTemplate,
): string {
  return `${perspective.systemPrompt}

---

Question: ${question}

Provide your analysis in 2-4 paragraphs. Be concrete and specific. End with your recommended approach from this perspective.`;
}

export function buildSynthesizerPrompt(
  question: string,
  perspectives: { name: string; response: string }[],
): string {
  const perspectiveBlocks = perspectives
    .map((p) => `### ${p.name}\n${p.response}`)
    .join("\n\n");

  return `You are synthesizing multiple expert perspectives on a technical question into a consensus analysis.

## Question
${question}

## Perspectives
${perspectiveBlocks}

## Your Task
Analyze the perspectives and produce a JSON response with this structure:

\`\`\`json
{
  "consensus": [
    {
      "type": "agreement",
      "summary": "Point all perspectives agree on",
      "confidence": 0.9,
      "perspectives": ["Simplicity Advocate", "Performance Architect"]
    },
    {
      "type": "disagreement",
      "summary": "Point where perspectives diverge",
      "confidence": 0.5,
      "perspectives": ["Simplicity Advocate", "Devil's Advocate"]
    },
    {
      "type": "insight",
      "summary": "Novel point raised by one perspective",
      "confidence": 0.7,
      "perspectives": ["Devil's Advocate"]
    }
  ],
  "recommendation": {
    "summary": "The recommended approach based on consensus",
    "confidence": 0.8,
    "reasoning": "Why this recommendation, weighing all perspectives"
  }
}
\`\`\`

Rules:
- confidence is 0-1 (1 = all perspectives strongly agree)
- List 3-6 consensus points
- The recommendation should weigh agreement heavily but note important dissent
- Be specific and actionable`;
}
