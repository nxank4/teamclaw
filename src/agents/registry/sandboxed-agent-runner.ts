/**
 * Runs custom agent handlers inside a secure-exec V8 isolate.
 * Handlers cannot close over external scope, access network,
 * spawn processes, or read env vars.
 *
 * secure-exec is loaded dynamically so missing prebuilt binaries
 * only fail at construction time, not at import time.
 */

export interface SandboxedAgentDef {
  name: string;
  handlerSource: string;
}

export class SandboxedAgentRunner {
  private runtime: { run: (code: string) => Promise<{ code: number; exports?: unknown; errorMessage?: string }>; dispose: () => void };
  private readonly agentName: string;
  private readonly handlerSource: string;

  private constructor(
    def: SandboxedAgentDef,
    runtime: SandboxedAgentRunner["runtime"],
  ) {
    this.agentName = def.name;
    this.handlerSource = def.handlerSource;
    this.runtime = runtime;
  }

  static async create(def: SandboxedAgentDef, workspacePath: string): Promise<SandboxedAgentRunner> {
    const { NodeRuntime, createNodeDriver, createNodeRuntimeDriverFactory } = await import("secure-exec");
    const runtime = new NodeRuntime({
      systemDriver: createNodeDriver({
        permissions: {
          fs: (req: { path: string }) => ({ allow: req.path.startsWith(workspacePath) }),
          network: () => ({ allow: false }),
          childProcess: () => ({ allow: false }),
          env: () => ({ allow: false }),
        },
      }),
      runtimeDriverFactory: createNodeRuntimeDriverFactory(),
      memoryLimit: 64,
      cpuTimeLimitMs: 10_000,
    });
    return new SandboxedAgentRunner(def, runtime);
  }

  async run(input: unknown): Promise<unknown> {
    const fullCode = `
      ${this.handlerSource}
      const handler = ${this.agentName}_handler;
      module.exports = handler(${JSON.stringify(input)});
    `;
    const result = await this.runtime.run(fullCode);
    if (result.code !== 0) {
      throw new Error(
        `Custom agent "${this.agentName}" failed (exit ${result.code}): ${result.errorMessage ?? "unknown error"}`,
      );
    }
    return result.exports;
  }

  dispose(): void {
    this.runtime.dispose();
  }
}
