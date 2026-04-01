/**
 * Sandboxed code execution via secure-exec V8 isolates.
 * One runtime per agent session — never per call (cold start is 16ms but adds up).
 *
 * secure-exec / isolated-vm is loaded dynamically so that missing prebuilt
 * binaries (e.g. Node 20 in CI) only fail at call time, not import time.
 */

export interface CodeResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  exports?: unknown;
  durationMs: number;
}

async function loadSecureExec() {
  const mod = await import("secure-exec");
  return mod;
}

export async function createAgentRuntime(workspacePath: string) {
  const { NodeRuntime, createNodeDriver, createNodeRuntimeDriverFactory } = await loadSecureExec();
  return new NodeRuntime({
    systemDriver: createNodeDriver({
      permissions: {
        fs: (req: { path: string }) => ({
          allow:
            req.path.startsWith(workspacePath) ||
            req.path.startsWith("/tmp/openpawl-"),
        }),
        network: () => ({ allow: false }),
        childProcess: (req: { command: string }) => ({
          allow: ["node", "npx", "python3", "python", "sh", "bash"].includes(
            req.command,
          ),
        }),
        env: (req: { key: string }) => ({
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
  // Runtime is lazily initialized on first use
  let runtimePromise: ReturnType<typeof createAgentRuntime> | null = null;

  function getRuntime() {
    if (!runtimePromise) runtimePromise = createAgentRuntime(workspacePath);
    return runtimePromise;
  }

  return {
    name: "execute_code" as const,
    description: `Run JavaScript/TypeScript in a secure V8 sandbox.
Sandbox has read/write access only to the current project workspace.
No network access. Set module.exports to return structured data.
Exit code 124 = CPU timeout (>15s). Optimize or break into smaller pieces.`,

    /* Run code capturing stdout */
    execute: async ({ code }: { code: string }): Promise<CodeResult> => {
      const start = Date.now();
      const stdioChunks: string[] = [];

      try {
        const runtime = await getRuntime();
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

    /* Run code and return module.exports */
    run: async <T>({ code }: { code: string }): Promise<CodeResult> => {
      const start = Date.now();
      try {
        const runtime = await getRuntime();
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

    dispose: () => {
      runtimePromise?.then(r => r.dispose()).catch(() => {});
    },
  };
}
