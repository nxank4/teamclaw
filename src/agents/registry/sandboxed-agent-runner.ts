/**
 * Runs custom agent handlers inside a secure-exec V8 isolate.
 * Handlers cannot close over external scope, access network,
 * spawn processes, or read env vars.
 */

import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

export interface SandboxedAgentDef {
  name: string;
  handlerSource: string;
}

export class SandboxedAgentRunner {
  private runtime: NodeRuntime;
  private readonly agentName: string;
  private readonly handlerSource: string;

  constructor(def: SandboxedAgentDef, workspacePath: string) {
    this.agentName = def.name;
    this.handlerSource = def.handlerSource;
    this.runtime = new NodeRuntime({
      systemDriver: createNodeDriver({
        permissions: {
          fs: (req) => ({ allow: req.path.startsWith(workspacePath) }),
          network: () => ({ allow: false }),
          childProcess: () => ({ allow: false }),
          env: () => ({ allow: false }),
        },
      }),
      runtimeDriverFactory: createNodeRuntimeDriverFactory(),
      memoryLimit: 64,
      cpuTimeLimitMs: 10_000,
    });
  }

  async run(input: unknown): Promise<unknown> {
    // Prepend handler source, then invoke it
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
