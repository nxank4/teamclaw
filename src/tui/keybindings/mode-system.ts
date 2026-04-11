/**
 * Operating mode system — controls how agents interact with tools.
 * Shift+Tab cycles modes: default → auto-accept → plan-only → review-only → default.
 */

import { ICONS } from "../constants/icons.js";
import { defaultTheme } from "../themes/default.js";
import type { StyleFn } from "../themes/theme.js";

export type OperatingMode = "default" | "auto-accept" | "plan-only" | "review-only";

export interface ModeInfo {
  mode: OperatingMode;
  displayName: string;
  shortName: string;
  description: string;
  icon: string;
  color: StyleFn;
}

const MODE_DEFS: ModeInfo[] = [
  { mode: "default", displayName: "Default", shortName: "default", description: "Agents ask before modifying files", icon: ICONS.diamond, color: defaultTheme.dim },
  { mode: "auto-accept", displayName: "Auto-accept", shortName: "auto", description: "Agents modify files without asking", icon: ICONS.bolt, color: defaultTheme.warning },
  { mode: "plan-only", displayName: "Plan only", shortName: "plan", description: "Agents plan but don't execute tools", icon: ICONS.planMode, color: defaultTheme.info },
  { mode: "review-only", displayName: "Review only", shortName: "review", description: "Agents read and analyze but don't modify", icon: ICONS.reviewMode, color: defaultTheme.muted },
];

const CYCLE_ORDER: OperatingMode[] = ["default", "auto-accept", "plan-only", "review-only"];

export class ModeSystem {
  private currentMode: OperatingMode;
  private enabledModes: OperatingMode[];

  constructor(config?: { enabledModes?: OperatingMode[] }) {
    this.enabledModes = config?.enabledModes ?? [...CYCLE_ORDER];
    this.currentMode = this.enabledModes[0] ?? "default";
  }

  cycleNext(): OperatingMode {
    const idx = this.enabledModes.indexOf(this.currentMode);
    this.currentMode = this.enabledModes[(idx + 1) % this.enabledModes.length] ?? "default";
    return this.currentMode;
  }

  cyclePrev(): OperatingMode {
    const idx = this.enabledModes.indexOf(this.currentMode);
    const prev = idx <= 0 ? this.enabledModes.length - 1 : idx - 1;
    this.currentMode = this.enabledModes[prev] ?? "default";
    return this.currentMode;
  }

  setMode(mode: OperatingMode): void {
    if (CYCLE_ORDER.includes(mode)) {
      this.currentMode = mode;
    }
  }

  getMode(): OperatingMode {
    return this.currentMode;
  }

  getModeInfo(): ModeInfo {
    return MODE_DEFS.find((m) => m.mode === this.currentMode) ?? MODE_DEFS[0]!;
  }

  getAllModes(): ModeInfo[] {
    return this.enabledModes.map((m) => MODE_DEFS.find((d) => d.mode === m)!);
  }
}
