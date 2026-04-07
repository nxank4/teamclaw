/**
 * Git branch management for research iterations.
 * All changes happen on a dedicated research branch — never touches main.
 */

import { execFileSync } from "node:child_process";

export class ResearchGitManager {
  private originalBranch: string;
  readonly branch: string;

  constructor(name: string) {
    this.originalBranch = this.getCurrentBranch();
    this.branch = `research/${name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`;
  }

  /** Create and checkout the research branch. */
  createBranch(): void {
    this.run("git", ["checkout", "-b", this.branch]);
  }

  /** Commit current changes with a description. */
  commit(message: string): void {
    this.run("git", ["add", "-A"]);
    this.run("git", ["commit", "-m", `research: ${message}`, "--allow-empty"]);
  }

  /** Revert the last commit (failed iteration). */
  revertLast(): void {
    this.run("git", ["reset", "--hard", "HEAD~1"]);
  }

  /** Return to the original branch without deleting the research branch. */
  returnToOriginal(): void {
    this.run("git", ["checkout", this.originalBranch]);
  }

  /** Get the number of commits on the research branch. */
  getCommitCount(): number {
    try {
      const output = this.run("git", ["rev-list", "--count", `${this.originalBranch}..HEAD`]);
      return parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  private getCurrentBranch(): string {
    return this.run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  }

  private run(cmd: string, args: string[]): string {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
}
