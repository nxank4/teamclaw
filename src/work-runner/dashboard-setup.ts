/**
 * Dashboard auto-start, health verification, and bridge initialization.
 *
 * The dashboard is a persistent background service — it survives work session
 * restarts and only stops on explicit `openpawl web stop` or process kill.
 */

import { logger } from "../core/logger.js";

export type DashboardSetupOptions = {
    webPort: number;
    dashboardPort?: number;
};

/**
 * Check if a OpenPawl dashboard is already serving on the given port.
 * Uses the /health endpoint added specifically for persistence detection.
 */
export async function isDashboardRunning(port: number): Promise<boolean> {
    try {
        const res = await fetch(`http://localhost:${port}/health`, {
            signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
            const body = await res.json() as { status?: string };
            return body.status === "ok";
        }
    } catch {
        // Not reachable
    }
    return false;
}

/**
 * Ensure the dashboard is running. If already running, reuse it.
 * If not, start a new daemon. Returns the actual port.
 */
export async function startDashboard(
    opts: DashboardSetupOptions,
): Promise<number> {
    const { start: startDaemon, status: daemonStatus } = await import("../daemon/manager.js");
    const webPort = opts.webPort;

    // Check if dashboard is already running via HTTP health check
    const alreadyRunning = await isDashboardRunning(webPort);
    if (alreadyRunning) {
        const dashboardUrl = `http://localhost:${webPort}`;
        logger.plain("");
        logger.plain(`>>> Connecting to dashboard at ${dashboardUrl}`);
        logger.plain("");

        // Initialize bridge to existing dashboard
        await initBridge(webPort);
        return webPort;
    }

    // Also check daemon state for a different port
    const preStatus = daemonStatus();
    if (preStatus.web === "running" && preStatus.webPort) {
        const existingPort = preStatus.webPort;
        const runningOnOtherPort = await isDashboardRunning(existingPort);
        if (runningOnOtherPort) {
            const dashboardUrl = `http://localhost:${existingPort}`;
            logger.plain("");
            logger.plain(`>>> Connecting to dashboard at ${dashboardUrl}`);
            logger.plain("");
            await initBridge(existingPort);
            return existingPort;
        }
    }

    // Start new daemon
    const daemonResult = startDaemon({ web: true, gateway: false, webPort });
    const actualStatus = daemonStatus();
    const actualPort = actualStatus.webPort || webPort;
    if (!daemonResult.error) {
        const dashboardUrl = `http://localhost:${actualPort}`;
        logger.plain("");
        logger.plain(`>>> Dashboard started at ${dashboardUrl}`);
        logger.plain("");

        // No auto-open — just show the URL
    } else {
        logger.warn(`Dashboard auto-start skipped: ${daemonResult.error}`);
    }

    // Verify dashboard is serving correctly (retry up to 5s for server startup)
    let dashboardHealthy = false;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            const res = await fetch(`http://localhost:${actualPort}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            if (res.ok) {
                logger.success(`>>> Dashboard Health: OK`);
                dashboardHealthy = true;
                break;
            }
        } catch {
            if (attempt < 9) {
                await new Promise((r) => setTimeout(r, 500));
            } else {
                logger.warn(`>>> Dashboard Health: unreachable after ${(attempt + 1) * 500}ms — server may still be starting`);
            }
        }
    }

    // Verify SSE endpoint (only if HTTP health passed)
    if (dashboardHealthy) {
        try {
            const sseCheckUrl = `http://localhost:${actualPort}/api/config`;
            const sseRes = await fetch(sseCheckUrl, { signal: AbortSignal.timeout(3000) });
            if (sseRes.ok) {
                logger.success(`>>> Dashboard SSE: OK (API reachable)`);
            } else {
                logger.warn(`>>> Dashboard SSE: unexpected status ${sseRes.status}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`>>> Dashboard SSE: check failed — ${msg}`);
        }
    }

    await initBridge(actualPort);
    return actualPort;
}

/** Initialize dashboard bridge to forward orchestration events + terminal output. */
async function initBridge(port: number): Promise<void> {
    try {
        const { initDashboardBridge, getDashboardBridge } = await import("../core/dashboard-bridge.js");
        const bridgeOk = await initDashboardBridge(port);
        if (bridgeOk) {
            logger.success(">>> Dashboard Bridge: CONNECTED");
            getDashboardBridge().startTerminalForwarding();
        } else {
            logger.warn(">>> Dashboard Bridge: connection failed — dashboard may not update in real-time.");
        }
    } catch {
        logger.warn(">>> Dashboard Bridge: init failed.");
    }
}
