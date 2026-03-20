/**
 * Setup Step: Team — template selection and custom roster builder.
 */

import {
    note,
    select,
    text,
} from "@clack/prompts";
import pc from "picocolors";
import { TEAM_TEMPLATES, type RosterEntry } from "../../core/team-templates.js";
import { getRoleTemplate } from "../../core/bot-definitions.js";
import { handleCancel, type WizardState } from "./connection.js";
import { stepCompositionMode } from "./composition-mode.js";
import type { CompositionWizardState } from "./composition-mode.js";

/** Goal-keyword → template-id mapping for hints. */
const GOAL_TEMPLATE_HINTS: Array<{ keywords: RegExp; templateId: string; reason: string }> = [
    { keywords: /\b(api|backend|endpoint|rest|graphql|microservice)\b/i, templateId: "api_service", reason: "API" },
    { keywords: /\b(fullstack|full.stack|frontend\s.*backend|react\s.*node)\b/i, templateId: "fullstack", reason: "full-stack" },
    { keywords: /\b(frontend|ui|interface|component|react|vue|svelte)\b/i, templateId: "fullstack", reason: "frontend" },
    { keywords: /\b(game|gameplay|sprite|level|unity|godot)\b/i, templateId: "game_dev", reason: "game dev" },
    { keywords: /\b(doc|documentation|readme|guide|tutorial|wiki)\b/i, templateId: "docs_team", reason: "documentation" },
    { keywords: /\b(content|blog|article|marketing|copy|write)\b/i, templateId: "content", reason: "content" },
    { keywords: /\b(build|implement|code|deploy|fix|refactor|test|ship)\b/i, templateId: "dev_team", reason: "development" },
];

/** Return a dim hint string if the goal matches a known template keyword. */
export function getGoalTemplateHint(goal: string): string | null {
    for (const { keywords, templateId, reason } of GOAL_TEMPLATE_HINTS) {
        if (keywords.test(goal)) {
            const tmpl = TEAM_TEMPLATES[templateId];
            if (tmpl) {
                return `Tip: your goal mentions "${reason}" — ${tmpl.name} template recommended`;
            }
        }
    }
    return null;
}

function formatTemplateSlots(template: { slots: Array<{ role_id: string; count: number }> }): string {
    return template.slots
        .map((slot) => {
            const role = getRoleTemplate(slot.role_id);
            const name = role?.name ?? slot.role_id;
            return `${slot.count}x ${name}`;
        })
        .join(", ");
}

async function customTeamBuilder(): Promise<RosterEntry[]> {
    const sizeInput = handleCancel(
        await text({
            message: "How many agents in your team?",
            initialValue: "4",
            placeholder: "3",
            validate: (v) => {
                const n = Number(v?.trim());
                if (!Number.isInteger(n) || n < 1) return "Team needs at least 1 agent.";
                if (n > 200) return "That's a big team — maximum is 200 agents.";
                return undefined;
            },
        }),
    ) as string;
    const totalCapacity = parseInt(sizeInput.trim(), 10) || 4;

    const roster: RosterEntry[] = [];

    while (true) {
        const currentAssigned = roster.reduce((sum, r) => sum + r.count, 0);
        const remaining = totalCapacity - currentAssigned;

        note(
            `Assigned: ${currentAssigned}/${totalCapacity} bots.\nRoster: ${
                roster.length === 0
                    ? "No roles assigned yet."
                    : roster.map((r) => `${r.count}x ${r.role}`).join(", ")
            }`,
            "Your team so far",
        );

        const action = handleCancel(
            await select({
                message: "What's next?",
                options: [
                    { label: "Done — looks good", value: "confirm" },
                    { label: "Add a role", value: "add" },
                    { label: "Edit a role", value: "edit" },
                    { label: "Remove a role", value: "remove" },
                ],
            }),
        ) as string;

        if (action === "confirm") {
            if (currentAssigned < totalCapacity) {
                note(`Assign all ${remaining} remaining agents first.`, "Not quite done");
                continue;
            }
            if (currentAssigned > totalCapacity) {
                note("Total assigned exceeds team size. Reduce some counts.", "Too many agents assigned");
                continue;
            }
            return roster;
        }

        if (action === "add") {
            if (remaining <= 0) {
                note("Your team is full. Edit or remove a role to make room.", "Team is full");
                continue;
            }

            const roleName = (handleCancel(
                await text({
                    message: "Role name:",
                    placeholder: "Backend Coder",
                    validate: (v) =>
                        (v ?? "").trim().length > 0 ? undefined : "Role name cannot be empty.",
                }),
            ) as string).trim();

            const description = (handleCancel(
                await text({
                    message: "What does this role do?",
                    placeholder: "Focuses on backend services, APIs, and data models.",
                }),
            ) as string).trim();

            const countInput = handleCancel(
                await text({
                    message: `How many "${roleName}" agents? (${remaining} spots left)`,
                    initialValue: String(Math.min(remaining, 1)),
                    validate: (v) => {
                        const n = Number(v?.trim());
                        if (!Number.isInteger(n) || n < 1) return "Enter a number greater than 0.";
                        if (n > remaining) return "Not enough spots left in the team.";
                        return undefined;
                    },
                }),
            ) as string;
            const count = parseInt(countInput.trim(), 10) || 1;

            const existingIndex = roster.findIndex(
                (r) => r.role.toLowerCase() === roleName.toLowerCase(),
            );
            if (existingIndex >= 0) {
                roster[existingIndex] = {
                    ...roster[existingIndex],
                    description: description || roster[existingIndex].description,
                    count: roster[existingIndex].count + count,
                };
            } else {
                roster.push({ role: roleName, description: description || "Custom role.", count });
            }
            continue;
        }

        if (action === "edit") {
            if (roster.length === 0) {
                note("No roles added yet — add one first.", "No roles yet");
                continue;
            }

            const roleIdx = handleCancel(
                await select({
                    message: "Which role to edit?",
                    options: roster.map((r, idx) => ({
                        value: idx,
                        label: `${r.role} (${r.count} bots)`,
                    })),
                }),
            ) as number;

            const existing = roster[roleIdx];
            const newName = (handleCancel(
                await text({
                    message: `Edit role name (currently "${existing.role}")`,
                    initialValue: existing.role,
                    validate: (v) =>
                        (v ?? "").trim().length > 0 ? undefined : "Role name cannot be empty.",
                }),
            ) as string).trim();

            const newDesc = (handleCancel(
                await text({ message: "Edit description", initialValue: existing.description }),
            ) as string).trim();

            const newCountInput = handleCancel(
                await text({
                    message: `Edit bot count for "${newName}"`,
                    initialValue: String(existing.count),
                    validate: (v) => {
                        const n = Number(v?.trim());
                        if (!Number.isInteger(n) || n < 1) return "Enter a number greater than 0.";
                        const hypothetical = currentAssigned - existing.count + n;
                        if (hypothetical > totalCapacity) return "That's more than your total team size.";
                        return undefined;
                    },
                }),
            ) as string;

            roster[roleIdx] = {
                role: newName,
                description: newDesc || existing.description,
                count: parseInt(newCountInput.trim(), 10) || existing.count,
            };
            continue;
        }

        if (action === "remove") {
            if (roster.length === 0) {
                note("Nothing to remove yet.", "No roles yet");
                continue;
            }

            const roleIdx = handleCancel(
                await select({
                    message: "Which role to remove?",
                    options: roster.map((r, idx) => ({
                        value: idx,
                        label: `${r.role} (${r.count} bots)`,
                    })),
                }),
            ) as number;
            roster.splice(roleIdx, 1);
            continue;
        }
    }
}

export async function stepTeam(state: WizardState): Promise<void> {
    const templateEntries = Object.entries(TEAM_TEMPLATES);
    const options: Array<{ value: string; label: string; hint?: string }> = templateEntries.map(
        ([id, tmpl]) => ({
            value: id,
            label: `${tmpl.name} ${pc.dim("—")} ${tmpl.description}`,
            hint: formatTemplateSlots(tmpl),
        }),
    );
    options.push({ value: "__custom", label: "Custom..." });

    // Show goal-based template suggestion if a keyword matches
    const hint = state.goal ? getGoalTemplateHint(state.goal) : null;
    if (hint) {
        console.log(`  ${pc.dim(hint)}`);
    }

    const picked = handleCancel(
        await select({
            message: "Who's on your team?",
            options,
        }),
    ) as string;

    if (picked === "__custom") {
        state.roster = await customTeamBuilder();
        state.templateId = "custom";
        // Ask composition mode only for custom teams
        await stepCompositionMode(state as CompositionWizardState);
    } else {
        const template = TEAM_TEMPLATES[picked]!;
        state.templateId = picked;
        state.roster = template.slots.map((slot) => {
            const role = getRoleTemplate(slot.role_id);
            return {
                role: role?.name ?? slot.role_id,
                count: slot.count,
                description: role ? role.skills.join(", ") : "",
            };
        });
        // Template teams default to autonomous
        (state as CompositionWizardState).teamMode = "autonomous";
    }
}
