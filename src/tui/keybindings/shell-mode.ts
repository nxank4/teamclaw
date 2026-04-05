/**
 * Shell mode — "!" prefix activates shell execution.
 * Output is displayed as a tool result and added to conversation context.
 */

export interface ShellModeResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  addedToContext: boolean;
}

export class ShellMode {
  private active = false;

  /**
   * Check if input should activate shell mode.
   * Only triggers when "!" is the first character in an otherwise empty prompt.
   */
  shouldActivate(input: string, cursorPosition: number): boolean {
    // Only activate when "!" is typed as first char at position 0
    return input === "!" && cursorPosition === 1;
  }

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Extract the shell command from input (strips "!" prefix).
   * "!npm test" → "npm test"
   * "! ls -la src/" → "ls -la src/"
   */
  extractCommand(input: string): string {
    return input.replace(/^!\s*/, "");
  }

  /**
   * Execute a shell command. Delegates to the provided executor function.
   */
  async execute(
    command: string,
    executor: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }>,
  ): Promise<ShellModeResult> {
    const result = await executor(command);
    this.deactivate();
    return {
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
      addedToContext: true,
    };
  }
}
