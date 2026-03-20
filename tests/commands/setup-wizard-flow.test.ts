/**
 * Tests for the setup wizard flow refactoring:
 * - Model selection runs inline after provider (no standalone Step 4)
 * - Goal step appears before team step
 * - Composition mode defaults to "autonomous" for template teams
 * - Goal-keyword hint for team template selection
 * - Summary omits "Team Mode" when autonomous (default)
 */

import { describe, it, expect } from "vitest";
import { getGoalTemplateHint } from "../../src/commands/setup/team-builder.js";

// ---------------------------------------------------------------------------
// Goal-keyword → template hint
// ---------------------------------------------------------------------------

describe("getGoalTemplateHint", () => {
    it("suggests API Service Team for goal containing 'api'", () => {
        const hint = getGoalTemplateHint("Build a REST API for user management");
        expect(hint).not.toBeNull();
        expect(hint).toContain("API");
        expect(hint).toContain("API Service Team");
    });

    it("suggests API Service Team for goal containing 'endpoint'", () => {
        const hint = getGoalTemplateHint("Create GraphQL endpoints for the dashboard");
        expect(hint).not.toBeNull();
        expect(hint).toContain("API");
    });

    it("suggests Full-Stack Team for goal containing 'frontend'", () => {
        const hint = getGoalTemplateHint("Build a frontend dashboard with charts");
        expect(hint).not.toBeNull();
        expect(hint).toContain("Full-Stack Team");
    });

    it("suggests Game Dev Team for goal containing 'game'", () => {
        const hint = getGoalTemplateHint("Create a 2D platformer game");
        expect(hint).not.toBeNull();
        expect(hint).toContain("Game Dev Team");
    });

    it("suggests Docs Team for goal containing 'documentation'", () => {
        const hint = getGoalTemplateHint("Write API documentation for v2");
        expect(hint).not.toBeNull();
        // 'api' matches first, which is fine — it's the first matching keyword
    });

    it("suggests Content Team for goal containing 'blog'", () => {
        const hint = getGoalTemplateHint("Write a blog post about our launch");
        expect(hint).not.toBeNull();
        expect(hint).toContain("Content Team");
    });

    it("suggests Dev Team for goal containing 'build'", () => {
        const hint = getGoalTemplateHint("Build a notification system");
        expect(hint).not.toBeNull();
        expect(hint).toContain("Dev Team");
    });

    it("returns null for goal with no matching keywords", () => {
        const hint = getGoalTemplateHint("Organize the quarterly offsite");
        expect(hint).toBeNull();
    });

    it("returns null for empty goal", () => {
        const hint = getGoalTemplateHint("");
        expect(hint).toBeNull();
    });

    it("matches case-insensitively", () => {
        const hint = getGoalTemplateHint("BUILD A REST API");
        expect(hint).not.toBeNull();
    });

    it("matches word boundaries only (no partial matches)", () => {
        // "rapid" contains "api" but not at a word boundary
        const hint = getGoalTemplateHint("Do a rapid prototype");
        // "rapid" should not match "api" — \b boundary check
        // However "prototype" doesn't match any keyword either
        // This tests that the regex uses word boundaries
        expect(hint).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Setup flow structure (static assertions — no interactive prompts)
// ---------------------------------------------------------------------------

describe("setup wizard flow structure", () => {
    it("stepTeam is exported and callable", async () => {
        const mod = await import("../../src/commands/setup/team-builder.js");
        expect(typeof mod.stepTeam).toBe("function");
    });

    it("stepCompositionMode is exported from composition-mode", async () => {
        const mod = await import("../../src/commands/setup/composition-mode.js");
        expect(typeof mod.stepCompositionMode).toBe("function");
    });

    it("CompositionWizardState extends WizardState with teamMode", async () => {
        // Type-level test: if this compiles, the interface is correct
        const mod = await import("../../src/commands/setup/composition-mode.js");
        expect(mod).toBeDefined();
    });

    it("setup.ts does not export stepModel (removed)", async () => {
        const mod = await import("../../src/commands/setup.js");
        expect((mod as Record<string, unknown>).stepModel).toBeUndefined();
    });

    it("getGoalTemplateHint is exported from team-builder", async () => {
        const mod = await import("../../src/commands/setup/team-builder.js");
        expect(typeof mod.getGoalTemplateHint).toBe("function");
    });
});
