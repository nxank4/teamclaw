/**
 * Generate contextual first prompt suggestions based on detected environment.
 */

import type { DetectedEnvironment, PromptSuggestion } from "./types.js";

export function generateFirstPrompts(env: DetectedEnvironment): PromptSuggestion[] {
  const projectType = env.project.type;

  if (projectType === "node") return nodePrompts();
  if (projectType === "rust") return rustPrompts();
  if (projectType === "python") return pythonPrompts();
  if (projectType === "go") return goPrompts();
  if (projectType) return genericProjectPrompts();
  return noProjectPrompts();
}

function nodePrompts(): PromptSuggestion[] {
  return [
    { text: "Explain this codebase structure and architecture", description: "Explore your project with AI", category: "explore" },
    { text: "Add input validation to the API endpoints", description: "Let agents improve your code", category: "fix" },
    { text: "Write tests for the untested modules", description: "Boost your test coverage", category: "create" },
    { text: "What are the security issues in this project?", description: "Get a security review", category: "learn" },
  ];
}

function rustPrompts(): PromptSuggestion[] {
  return [
    { text: "Explain this codebase structure and architecture", description: "Explore your project with AI", category: "explore" },
    { text: "Add error handling with thiserror", description: "Improve error handling", category: "fix" },
    { text: "Write integration tests for the CLI commands", description: "Boost test coverage", category: "create" },
    { text: "Review unsafe blocks and suggest alternatives", description: "Safety review", category: "learn" },
  ];
}

function pythonPrompts(): PromptSuggestion[] {
  return [
    { text: "Explain this codebase structure and architecture", description: "Explore your project with AI", category: "explore" },
    { text: "Add type hints to the main modules", description: "Improve type safety", category: "fix" },
    { text: "Write pytest tests for the core logic", description: "Boost test coverage", category: "create" },
    { text: "What are the potential issues in this code?", description: "Code review", category: "learn" },
  ];
}

function goPrompts(): PromptSuggestion[] {
  return [
    { text: "Explain this codebase structure and architecture", description: "Explore your project with AI", category: "explore" },
    { text: "Add proper error wrapping with fmt.Errorf", description: "Improve error handling", category: "fix" },
    { text: "Write table-driven tests for the handlers", description: "Boost test coverage", category: "create" },
    { text: "Review goroutine usage for race conditions", description: "Concurrency review", category: "learn" },
  ];
}

function genericProjectPrompts(): PromptSuggestion[] {
  return [
    { text: "Explain this codebase structure and architecture", description: "Explore your project with AI", category: "explore" },
    { text: "Find and fix potential bugs in the codebase", description: "Let agents debug for you", category: "fix" },
    { text: "Add tests for the untested code paths", description: "Boost test coverage", category: "create" },
    { text: "What improvements would you suggest?", description: "Get AI recommendations", category: "learn" },
  ];
}

function noProjectPrompts(): PromptSuggestion[] {
  return [
    { text: "Build a REST API with auth and tests", description: "Start a new project", category: "create" },
    { text: "Create a CLI tool that converts markdown", description: "Build something useful", category: "create" },
    { text: "Explain how async/await works in JavaScript", description: "Learn something new", category: "learn" },
    { text: "Help me plan an expense tracking app", description: "Plan before you build", category: "explore" },
  ];
}
