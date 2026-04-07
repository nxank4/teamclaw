/**
 * Debate runner — orchestrates parallel multi-perspective analysis
 * and consensus synthesis.
 */

import { ProxyService, createProxyService } from "../proxy/ProxyService.js";
import {
  DEFAULT_PERSPECTIVES,
  buildDebatePrompt,
  type PerspectiveTemplate,
} from "./perspectives.js";
import { synthesize } from "./synthesizer.js";
import type {
  Perspective,
  DebateResult,
  DebateEvent,
} from "./types.js";
import { logger } from "../core/logger.js";

export interface DebateOptions {
  perspectives?: PerspectiveTemplate[];
  onEvent?: (event: DebateEvent) => void;
}

const FALLBACK_RESULT: DebateResult = {
  question: "",
  perspectives: [],
  consensus: [],
  recommendation: {
    summary: "Debate could not complete — no perspectives were generated.",
    confidence: 0,
    reasoning: "All agent calls failed.",
  },
};

export async function runDebate(
  question: string,
  options?: DebateOptions,
): Promise<DebateResult> {
  const templates = options?.perspectives ?? DEFAULT_PERSPECTIVES;
  const emit = options?.onEvent;

  emit?.({ stage: "perspectives" });

  // Run all perspectives in parallel
  const perspectiveResults = await Promise.allSettled(
    templates.map((template) => runPerspective(question, template, emit)),
  );

  const perspectives: Perspective[] = [];
  for (let i = 0; i < perspectiveResults.length; i++) {
    const result = perspectiveResults[i]!;
    const template = templates[i]!;
    if (result.status === "fulfilled" && result.value) {
      perspectives.push(result.value);
    } else {
      logger.warn(`Perspective '${template.name}' failed`);
      perspectives.push({
        id: template.id,
        name: template.name,
        description: template.description,
        response: "(This perspective could not be generated.)",
      });
    }
  }

  if (perspectives.every((p) => p.response.startsWith("(This"))) {
    return { ...FALLBACK_RESULT, question };
  }

  // Synthesize consensus
  emit?.({ stage: "synthesizing" });

  const synthesis = await synthesize(
    {
      question,
      perspectives: perspectives.map((p) => ({
        name: p.name,
        response: p.response,
      })),
    },
    (content) => emit?.({ stage: "synthesizing", content }),
  );

  const result: DebateResult = {
    question,
    perspectives,
    consensus: synthesis.consensus,
    recommendation: synthesis.recommendation,
  };

  emit?.({ stage: "done", result });

  return result;
}

async function runPerspective(
  question: string,
  template: PerspectiveTemplate,
  emit?: (event: DebateEvent) => void,
): Promise<Perspective> {
  const proxy: ProxyService = await createProxyService();
  const prompt = buildDebatePrompt(question, template);

  let response = "";
  for await (const chunk of proxy.stream(prompt)) {
    response += chunk.content;
    emit?.({
      stage: "perspectives",
      perspectiveId: template.id,
      content: chunk.content,
    });
  }

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    response: response.trim(),
  };
}
