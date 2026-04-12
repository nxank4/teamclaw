/**
 * Built-in seed templates bundled with OpenPawl.
 * These work offline — no network needed.
 */

import type { OpenPawlTemplate } from "../types.js";

export const SEED_TEMPLATE_IDS = [
  "content-creator",
  "indie-hacker",
  "research-intelligence",
  "business-ops",
  "full-stack-sprint",
] as const;

const SEED_TEMPLATES: OpenPawlTemplate[] = [
  {
    id: "content-creator",
    name: "Content Creator Team",
    version: "0.0.1",
    author: "nxank4",
    description: "Research, script, SEO, and review pipeline for content creators",
    tags: ["content", "youtube", "social-media", "writing"],
    estimatedCostPerRun: 0.07,
    defaultGoalTemplate: "Create {contentType} about {topic}",
    pipeline: ["researcher", "scriptwriter", "seo-analyst", "qa-reviewer"],
    agents: [
      {
        role: "researcher",
        task: "Research topic, trends, and audience insights",
        taskTypes: ["research", "analysis"],
        compositionRules: { required: true, includeKeywords: ["research", "topic"] },
      },
      {
        role: "scriptwriter",
        task: "Write content script or article draft",
        taskTypes: ["writing", "scripting"],
        compositionRules: { required: true, includeKeywords: ["write", "script", "content"] },
      },
      {
        role: "seo-analyst",
        task: "Optimize for SEO keywords and structure",
        taskTypes: ["seo", "optimization"],
        compositionRules: { includeKeywords: ["seo", "keyword", "optimize"] },
      },
      {
        role: "qa-reviewer",
        task: "Final quality review and fact-check",
        taskTypes: ["review", "quality"],
        compositionRules: { required: true },
      },
    ],
  },
  {
    id: "indie-hacker",
    name: "Indie Hacker Team",
    version: "0.0.1",
    author: "nxank4",
    description: "Architect, engineer, QA, and RFC pipeline for solo builders",
    tags: ["coding", "saas", "startup"],
    estimatedCostPerRun: 0.12,
    defaultGoalTemplate: "Build {feature} for {project}",
    pipeline: ["architect", "engineer", "qa-engineer", "rfc-author"],
    agents: [
      {
        role: "architect",
        task: "Design system architecture and component boundaries",
        taskTypes: ["design", "architecture"],
        compositionRules: { required: true, includeKeywords: ["design", "architect", "plan"] },
      },
      {
        role: "engineer",
        task: "Implement features and write code",
        taskTypes: ["implementation", "coding"],
        compositionRules: { required: true, includeKeywords: ["build", "implement", "code"] },
      },
      {
        role: "qa-engineer",
        task: "Write tests and verify correctness",
        taskTypes: ["testing", "quality"],
        compositionRules: { required: true },
      },
      {
        role: "rfc-author",
        task: "Document decisions and technical rationale",
        taskTypes: ["documentation", "rfc"],
        compositionRules: { includeKeywords: ["rfc", "proposal", "document"] },
      },
    ],
  },
  {
    id: "research-intelligence",
    name: "Research Intelligence Team",
    version: "0.0.1",
    author: "nxank4",
    description: "Deep research, synthesis, and report generation for market intelligence",
    tags: ["research", "analysis", "intelligence"],
    estimatedCostPerRun: 0.09,
    defaultGoalTemplate: "Research {topic} and produce {deliverable}",
    pipeline: ["primary-researcher", "fact-checker", "synthesizer"],
    agents: [
      {
        role: "primary-researcher",
        task: "Deep research and data gathering",
        taskTypes: ["research", "data-gathering"],
        compositionRules: { required: true, includeKeywords: ["research", "investigate", "analyze"] },
      },
      {
        role: "fact-checker",
        task: "Verify claims and cross-reference sources",
        taskTypes: ["verification", "validation"],
        compositionRules: { includeKeywords: ["verify", "check", "validate"] },
      },
      {
        role: "synthesizer",
        task: "Synthesize findings into actionable report",
        taskTypes: ["synthesis", "summarization"],
        compositionRules: { required: true, includeKeywords: ["summarize", "synthesize", "report"] },
      },
    ],
  },
  {
    id: "business-ops",
    name: "Business Operations Team",
    version: "0.0.1",
    author: "nxank4",
    description: "Process automation, documentation, and workflow optimization",
    tags: ["business", "operations", "automation"],
    estimatedCostPerRun: 0.08,
    defaultGoalTemplate: "Optimize {process} for {department}",
    pipeline: ["process-analyst", "automation-engineer", "documentation-writer"],
    agents: [
      {
        role: "process-analyst",
        task: "Map current processes and identify improvements",
        taskTypes: ["analysis", "process-mapping"],
        compositionRules: { required: true, includeKeywords: ["process", "workflow", "optimize"] },
      },
      {
        role: "automation-engineer",
        task: "Build automation scripts and integrations",
        taskTypes: ["automation", "scripting"],
        compositionRules: { includeKeywords: ["automate", "script", "integrate"] },
      },
      {
        role: "documentation-writer",
        task: "Write SOPs and operational guides",
        taskTypes: ["documentation", "sop"],
        compositionRules: { required: true, includeKeywords: ["document", "sop", "guide"] },
      },
    ],
  },
  {
    id: "full-stack-sprint",
    name: "Full-Stack Sprint Team",
    version: "0.0.1",
    author: "nxank4",
    description: "Frontend, backend, and DevOps for rapid full-stack feature sprints",
    tags: ["fullstack", "sprint", "devops"],
    estimatedCostPerRun: 0.15,
    defaultGoalTemplate: "Ship {feature} end-to-end",
    pipeline: ["frontend-engineer", "backend-engineer", "devops-engineer", "tech-lead"],
    agents: [
      {
        role: "frontend-engineer",
        task: "Build UI components and client-side logic",
        taskTypes: ["frontend", "ui", "ux"],
        compositionRules: { includeKeywords: ["frontend", "ui", "component", "react"] },
      },
      {
        role: "backend-engineer",
        task: "Build APIs, database schemas, server logic",
        taskTypes: ["backend", "api", "database"],
        compositionRules: { required: true, includeKeywords: ["api", "backend", "database", "server"] },
      },
      {
        role: "devops-engineer",
        task: "Set up CI/CD, deployment, infrastructure",
        taskTypes: ["deployment", "ci-cd", "infrastructure"],
        compositionRules: { includeKeywords: ["deploy", "ci", "docker", "infra"] },
      },
      {
        role: "tech-lead",
        task: "Code review, coordination, architecture decisions",
        taskTypes: ["review", "coordination"],
        compositionRules: { required: true },
      },
    ],
  },
];

export function getAllSeedTemplates(): OpenPawlTemplate[] {
  return [...SEED_TEMPLATES];
}

export function getSeedTemplate(id: string): OpenPawlTemplate | null {
  return SEED_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function isSeedTemplate(id: string): boolean {
  return SEED_TEMPLATES.some((t) => t.id === id);
}
