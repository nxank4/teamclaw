/**
 * Mouse interaction types.
 */

export interface InteractiveElement {
  id: string;
  region: { x1: number; y1: number; x2: number; y2: number };
  hoverStyle: "underline" | "brighten" | "both";
  onClick: () => void;
  onHover?: () => void;
  onLeave?: () => void;
  tooltip?: string;
}
