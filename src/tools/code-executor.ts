/**
 * Sandboxed code execution via secure-exec V8 isolates.
 * One runtime per agent session — never per call (cold start is 16ms but adds up).
 */

import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

export interface CodeResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  exports?: unknown;
  durationMs: number;
}

export function createAgentRuntime(workspacePath: string): NodeRuntime {
  return new NodeRuntime({
    systemDriver: createNodeDriver({
      permissions: {
        fs: (req) => ({
          allow:
            req.path.startsWith(workspacePath) ||
            req.path.startsWith("/tmp/teamclaw-"),
        }),
        network: () => ({ allow: false }),
        childProcess: (req) => ({
          allow: ["node", "npx", "python3", "python", "sh", "bash"].includes(
            req.command,
          ),
        }),
        env: (req) => ({
          allow: ["PATH", "HOME", "NODE_PATH", "NODE_ENV", "TMPDIR"].includes(
            req.key,
          ),
        }),
      },
    }),
    runtimeDriverFactory: createNodeRuntimeDriverFactory(),
    memoryLimit: 128,
    cpuTimeLimitMs: 15_000,
    timingMitigation: "freeze",
    payloadLimits: {
      base64TransferBytes: 10 * 1024 * 1024,
      jsonPayloadBytes: 5 * 1024 * 1024,
    },
  });
}

export function createCodeExecutorTool(workspacePath: string) {
  const runtime = createAgentRuntime(workspacePath);

  return {
    name: "execute_code" as const,
    description: `Execute JavaScript/TypeScript code in a secure V8 sandbox.
Sandbox has read/write access only to the current project workspace.
No network access. Set module.exports to return structured data.
Exit code 124 = CPU timeout (>15s). Optimize or break into smaller pieces.`,

    execute: async ({ code }: { code: string }): Promise<CodeResult> => {
      const start = Date.now();
      const stdioChunks: string[] = [];

      try {
        const result = await runtime.exec(code, {
          onStdio: (event: { channel: string; message: string }) => {
            stdioChunks.push(event.message);
          },
        });
        return {
          success: result.code === 0,
          output: stdioChunks.join(""),
          error:
            result.code !== 0 ? (result.errorMessage ?? undefined) : undefined,
          exitCode: result.code,
          exports: undefined,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          output: stdioChunks.join(""),
          error: err instanceof Error ? err.message : String(err),
          exitCode: 1,
          durationMs: Date.now() - start,
        };
      }
    },

    run: async <T>({ code }: { code: string }): Promise<CodeResult> => {
      const start = Date.now();
      try {
        const result = await runtime.run<T>(code);
        return {
          success: result.code === 0,
          output: "",
          error:
            result.code !== 0 ? (result.errorMessage ?? undefined) : undefined,
          exitCode: result.code,
          exports: result.exports,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: err instanceof Error ? err.message : String(err),
          exitCode: 1,
          durationMs: Date.now() - start,
        };
      }
    },

    dispose: () => runtime.dispose(),
  };
}
