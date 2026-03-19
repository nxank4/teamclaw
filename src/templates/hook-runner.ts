/**
 * Runs template setup hooks in a secure-exec sandbox.
 * Template hooks are third-party code — treated as untrusted.
 * Each invocation gets a fresh runtime (one-shot).
 */

import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
} from "secure-exec";

export async function runTemplateHook(
  hookCode: string,
  projectPath: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const runtime = new NodeRuntime({
    systemDriver: createNodeDriver({
      permissions: {
        fs: (req) => ({ allow: req.path.startsWith(projectPath) }),
        network: () => ({ allow: false }),
        childProcess: () => ({ allow: false }),
        env: () => ({ allow: false }),
      },
    }),
    runtimeDriverFactory: createNodeRuntimeDriverFactory(),
    memoryLimit: 64,
    cpuTimeLimitMs: 30_000,
  });

  try {
    const stdioChunks: string[] = [];
    const result = await runtime.exec(hookCode, {
      onStdio: (event: { channel: string; message: string }) => {
        stdioChunks.push(event.message);
      },
    });
    return {
      success: result.code === 0,
      output: stdioChunks.join(""),
      error:
        result.code !== 0 ? (result.errorMessage ?? undefined) : undefined,
    };
  } finally {
    runtime.dispose();
  }
}
