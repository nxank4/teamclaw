import { ctp } from "../tui/themes/default.js";
import { formatRelativeTime } from "../utils/formatters.js";
import type { Session } from "../session/session.js";

const MAX_TITLE_LENGTH = 40;

export function buildResumeBannerContent(session: Session): string {
  const state = session.getState();
  const title = truncate(state.title, MAX_TITLE_LENGTH);
  const count = session.messageCount;
  const ago = formatRelativeTime(state.updatedAt);
  return ctp.subtext1(`Resuming session: ${title} · ${count} messages · ${ago}`);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
