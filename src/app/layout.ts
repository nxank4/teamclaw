/**
 * TUI application layout — composes Messages + Divider + Editor + StatusBar.
 *
 * Uses split-region rendering:
 *   messages area  (scrollable, fills remaining rows)
 *   ──────────────  divider      ─┐
 *   │ editor │      input box     │ fixed at bottom
 *   status bar      segments     ─┘
 */
import {
  TUI,
  StatusBarComponent,
  MessagesComponent,
  EditorComponent,
  DividerComponent,
  type Terminal,
} from "../tui/index.js";
import { defaultTheme } from "../tui/themes/default.js";
import {
  StickyRegionComponent,
  setStickyRegion,
} from "../tui/components/sticky-region/index.js";

export interface AppLayout {
  tui: TUI;
  statusBar: StatusBarComponent;
  messages: MessagesComponent;
  editor: EditorComponent;
  divider: DividerComponent;
  stickyRegion: StickyRegionComponent;
}

export function createLayout(terminal?: Terminal): AppLayout {
  const tui = new TUI(terminal);

  const messages = new MessagesComponent("messages");
  const divider = new DividerComponent("divider");
  const stickyRegion = new StickyRegionComponent({
    requestFixedRender: () => tui.requestFixedRender(),
    addMessage: (role, content) => {
      messages.addMessage({
        role: role as "system" | "user" | "error" | "assistant" | "agent" | "tool",
        content,
        timestamp: new Date(),
      });
      tui.requestRender();
    },
  });
  setStickyRegion(stickyRegion);
  const editor = new EditorComponent("editor", "Type a prompt, /command, @file, or !shell...");
  const statusBar = new StatusBarComponent("status", defaultTheme.statusBarBg);

  // Scrollable region (fills remaining space above fixed bottom)
  tui.setScrollableContent(messages);

  // Fixed at bottom (top-to-bottom on screen):
  //   divider → sticky → editor → statusBar.
  // The sticky region collapses to zero rows when no block is active,
  // so the visible layout matches the pre-PR behaviour until a producer
  // mounts onto it.
  tui.addFixedBottom(divider);
  tui.addFixedBottom(stickyRegion);
  tui.addFixedBottom(editor);
  tui.addFixedBottom(statusBar);

  // Wire responsive layout providers
  const layoutProvider = () => tui.getLayout();
  editor.setLayoutProvider(layoutProvider);
  messages.setLayoutProvider(layoutProvider);
  statusBar.setLayoutProvider(layoutProvider);

  tui.setFocus(editor);

  return { tui, statusBar, messages, editor, divider, stickyRegion };
}
