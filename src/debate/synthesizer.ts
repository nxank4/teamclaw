/**
 * Consensus synthesizer — takes multiple perspective responses
 * and extracts agreement, disagreement, and insights.
 */

import { ProxyService, createProxyService } from "../proxy/ProxyService.js";
import { parseLlmJson } from "../utils/jsonExtractor.js";
import { buildSynthesizerPrompt } from "./perspectives.js";
import type { ConsensusPoint, DebateRecommendation } from "./types.js";

export interface SynthesisInput {
  question: string;
  perspectives: { name: string; response: string }[];
}

export interface SynthesisResult {
  consensus: ConsensusPoint[];
  recommendation: DebateRecommendation;
}

const FALLBACK_RESULT: SynthesisResult = {
  consensus: [],
  recommendation: {
    summary: "Could not synthesize perspectives — review individually.",
    confidence: 0,
    reasoning: "Synthesis failed. Please review the individual perspectives above.",
  },
};

export async function synthesize(
  input: SynthesisInput,
  onChunk?: (content: string) => void,
): Promise<SynthesisResult> {
  let proxy: ProxyService;
  try {
    proxy = await createProxyService();
  } catch {
    return FALLBACK_RESULT;
  }

  const prompt = buildSynthesizerPrompt(input.question, input.perspectives);

  let raw = "";
  try {
    for await (const chunk of proxy.stream(prompt)) {
      raw += chunk.content;
      onChunk?.(chunk.content);
    }
  } catch {
    return extractFallback(raw);
  }

  try {
    const parsed = parseLlmJson<{
      consensus: ConsensusPoint[];
      recommendation: DebateRecommendation;
    }>(raw);

    // Validate and normalize
    const consensus = (parsed.consensus ?? []).map((c) => ({
      type: c.type ?? "insight",
      summary: c.summary ?? "",
      confidence: Math.max(0, Math.min(1, c.confidence ?? 0.5)),
      perspectives: c.perspectives ?? [],
    }));

    const recommendation: DebateRecommendation = {
      summary: parsed.recommendation?.summary ?? "See analysis above.",
      confidence: Math.max(0, Math.min(1, parsed.recommendation?.confidence ?? 0.5)),
      reasoning: parsed.recommendation?.reasoning ?? raw.slice(0, 500),
    };

    return { consensus, recommendation };
  } catch {
    return extractFallback(raw);
  }
}

function extractFallback(raw: string): SynthesisResult {
  const text = (raw ?? "").trim();
  if (!text) return FALLBACK_RESULT;

  return {
    consensus: [{
      type: "insight",
      summary: "See full synthesis text below.",
      confidence: 0.5,
      perspectives: [],
    }],
    recommendation: {
      summary: text.split("\n")[0] ?? "See analysis.",
      confidence: 0.5,
      reasoning: text.slice(0, 1000),
    },
  };
}
