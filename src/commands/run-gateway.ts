import { exec, spawn, ChildProcess } from "child_process";
import { text, spinner } from "@clack/prompts";
import { randomPhrase } from "../utils/spinner-phrases.js";
import { logger } from "../core/logger.js";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLocalOpenClawConfig } from "../core/discovery.js";

function commandExists(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
        exec(`command -v ${cmd}`, (err) => {
            resolve(!err);
        });
    });
}

export function detectPortFromConfig(): string {
    // Try to read from local gateway config file
    const localCfg = readLocalOpenClawConfig();
    if (localCfg) {
        return String(localCfg.port);
    }
    return "18789";
}

/**
 * Auto-detect the gateway HTTP API port by reading the local config
 * file first (gateway.http.port), then defaulting to 18789.
 */
export function detectHttpPortFromConfig(): string {
    // Try reading local gateway config
    try {
        const localCfg = readLocalOpenClawConfig();
        if (localCfg && localCfg.httpPort > 0) {
            return String(localCfg.httpPort);
        }
    } catch {
        // ignore
    }

    return "18789";
}

export async function isPortInUse(port: number | string): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        server.once("listening", () => {
            server.close();
            resolve(false);
        });
        server.listen(Number(port), "127.0.0.1");
    });
}

export interface StartGatewayOptions {
    port?: string;
    skipPrompt?: boolean;
}

export async function startGateway(options: StartGatewayOptions = {}): Promise<void> {
    const { port: explicitPort, skipPrompt } = options;

    let port = explicitPort;

    if (!port && !skipPrompt) {
        const detectedPort = detectPortFromConfig();
        const input = await text({
            message: `Enter gateway port`,
            defaultValue: detectedPort,
            placeholder: detectedPort,
        });
        port = (input as string).trim() || detectedPort;
    } else if (!port) {
        port = detectPortFromConfig();
    }

    const child = await startGatewayBinary(port);
    const pid = child.pid ?? -1;
    const logPath = getGatewayLogPath();

    const ready = await waitForPort(port, 10000);

    if (!ready) {
        logger.error(`Gateway failed to start within 10 seconds on port ${port}`);
        logger.plain(`Check log at: ${logPath}`);
        process.exit(1);
    }

    logger.success(`LLM gateway is running in the background on port ${port}.`);
    logger.plain(`PID: ${pid}`);
    logger.plain(`Log: ${logPath}`);

    process.exit(0);
}

async function findGatewayCommand(): Promise<string | null> {
    const gatewayCmd = "openclaw";
    const npxCmd = "npx";

    const hasGateway = await commandExists(gatewayCmd);
    if (hasGateway) return gatewayCmd;

    const hasNpx = await commandExists(npxCmd);
    if (hasNpx) return npxCmd;

    return null;
}

function getGatewayLogPath(): string {
    const homeDir = os.homedir();
    const logDir = path.join(homeDir, ".teamclaw");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    return path.join(logDir, "gateway.log");
}

export async function startGatewayBinary(port: string): Promise<ChildProcess> {
    const cmd = await findGatewayCommand();

    if (!cmd) {
        logger.error("No gateway binary found in PATH.");
        logger.plain("");
        logger.plain("Install a gateway binary or use the built-in provider system instead.");
        process.exit(1);
    }

    const args = cmd === "openclaw"
        ? ["gateway", "--port", port]
        : ["openclaw", "gateway", "--port", port];

    const logPath = getGatewayLogPath();
    const logStream = fs.openSync(logPath, "a");

    const child = spawn(cmd, args, {
        detached: true,
        stdio: ["ignore", logStream, logStream],
        shell: false,
    });

    child.unref();

    return child;
}

export async function waitForPort(
    port: number | string,
    timeoutMs: number = 10000
): Promise<boolean> {
    const start = Date.now();
    const portNum = Number(port);

    while (Date.now() - start < timeoutMs) {
        const inUse = await isPortInUse(portNum);
        if (inUse) {
            return true;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

export interface ManagedGatewayState {
    pid: number | null;
    wasAlreadyRunning: boolean;
}

let managedGateway: {
    process: ChildProcess;
    pid: number;
    wasAlreadyRunning: boolean;
} | null = null;

export async function startManagedGateway(
    port: string,
    options: { useSpinner?: boolean } = {}
): Promise<ManagedGatewayState> {
    const portNum = Number(port);
    const wasAlreadyRunning = await isPortInUse(portNum);

    if (wasAlreadyRunning) {
        logger.info(`Gateway already running on port ${port}`);
        return { pid: null, wasAlreadyRunning: true };
    }

    const s = options.useSpinner ? spinner() : null;
    s?.start(randomPhrase("gateway"));

    const child = await startGatewayBinary(port);
    const pid = child.pid ?? -1;

    const ready = await waitForPort(portNum, 10000);

    if (!ready) {
        s?.stop("Failed to start gateway (timeout)");
        logger.error(`Gateway failed to start within 10 seconds on port ${port}`);
        child.kill();
        process.exit(1);
    }

    s?.stop(`Gateway started on port ${port}`);

    managedGateway = {
        process: child,
        pid,
        wasAlreadyRunning: false,
    };

    return { pid, wasAlreadyRunning: false };
}

export function cleanupManagedGateway(): void {
    if (managedGateway && !managedGateway.wasAlreadyRunning) {
        try {
            // Kill the entire process group (negative PID) since the gateway
            // is spawned with detached:true and may have child processes.
            process.kill(-managedGateway.pid, "SIGTERM");
            logger.info(`Killed managed gateway process group (PID: ${managedGateway.pid})`);
        } catch {
            // Process group may have already exited; try single PID as fallback
            try {
                process.kill(managedGateway.pid, "SIGTERM");
            } catch {
                // Already gone
            }
        }
        managedGateway = null;
    }
}

let _cleanupHandlersInstalled = false;

export function setupGatewayCleanupHandlers(): void {
    if (_cleanupHandlersInstalled) return;
    _cleanupHandlersInstalled = true;

    const cleanup = () => {
        cleanupManagedGateway();
    };

    // Only register on "exit" — SIGINT/SIGTERM are handled by the work-runner
    // which controls abort signal propagation and exit timing.
    process.on("exit", cleanup);
}
