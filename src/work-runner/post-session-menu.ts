/**
 * Post-session interactive menu — lets users continue, start new goals,
 * review in dashboard, or exit after a work session completes.
 */

import { select, text, isCancel, outro } from "@clack/prompts";
import { logger } from "../core/logger.js";

export type PostSessionChoice = "continue" | "new-goal" | "dashboard" | "exit";

export interface PostSessionResult {
    choice: PostSessionChoice;
    /** New goal text when choice is "new-goal" */
    newGoal?: string;
}

/**
 * Show the post-session interactive menu.
 * Returns the user's choice and any associated data.
 *
 * Skips the menu (returns "exit") when:
 * - stdin is not a TTY (non-interactive/CI)
 * - noInteractive flag is set
 */
export async function showPostSessionMenu(opts: {
    noInteractive?: boolean;
    dashboardPort?: number;
}): Promise<PostSessionResult> {
    // Skip menu in non-interactive contexts
    if (!process.stdin.isTTY || opts.noInteractive) {
        return { choice: "exit" };
    }

    const dashboardUrl = opts.dashboardPort
        ? `http://localhost:${opts.dashboardPort}`
        : "http://localhost:9001";

    try {
        const choice = await select({
            message: "What would you like to do next?",
            options: [
                {
                    value: "continue" as const,
                    label: "Continue — run another session",
                    hint: "same goal, agents remember everything",
                },
                {
                    value: "new-goal" as const,
                    label: "New goal — start fresh",
                    hint: "same project and team",
                },
                {
                    value: "dashboard" as const,
                    label: "Review in dashboard",
                    hint: dashboardUrl,
                },
                {
                    value: "exit" as const,
                    label: "Exit",
                },
            ],
        });

        if (isCancel(choice)) {
            outro("Done! Run openpawl work whenever you're ready.");
            return { choice: "exit" };
        }

        if (choice === "new-goal") {
            const newGoal = await text({
                message: "What's the new goal?",
                placeholder: "Describe what you want to build next",
            });

            if (isCancel(newGoal) || !newGoal?.trim()) {
                return { choice: "exit" };
            }

            return { choice: "new-goal", newGoal: String(newGoal).trim() };
        }

        if (choice === "dashboard") {
            try {
                const { default: open } = await import("open");
                await open(dashboardUrl);
                logger.success(`Opened ${dashboardUrl} in browser`);
            } catch {
                logger.plain(`Open ${dashboardUrl} in your browser`);
            }
            // Show menu again after opening dashboard
            return showPostSessionMenu(opts);
        }

        return { choice: choice as PostSessionChoice };
    } catch {
        // Handle unexpected errors (e.g., stdin closed)
        return { choice: "exit" };
    }
}
