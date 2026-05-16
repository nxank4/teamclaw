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
  CrewProgressView,
  type Terminal,
} from "../tui/index.js";
import { defaultTheme } from "../tui/themes/default.js";
import { createCrewRunState } from "./crew-run-state.js";

export interface AppLayout {
  tui: TUI;
  statusBar: StatusBarComponent;
  messages: MessagesComponent;
  editor: EditorComponent;
  divider: DividerComponent;
  crewProgress: CrewProgressView;
}

export function createLayout(terminal?: Terminal): AppLayout {
  const tui = new TUI(terminal);

  const messages = new MessagesComponent("messages");
  // CrewProgressView is no longer a fixed-bottom overlay — it lives in
  // the chat stream as a tagged "crew-progress" system message that
  // router-wiring updates in place via MessagesComponent.replaceByTag.
  // The class instance here is a stateful renderer adapter: it holds
  // the current CrewRunState + spinner frame and turns them into the
  // styled tree on demand. `hidden` is unused now but kept for binary
  // compatibility with any external consumers.
  const crewProgress = new CrewProgressView("crew-progress", {
    state: createCrewRunState(""),
    spinnerFrame: 0,
  });
  const divider = new DividerComponent("divider");
  const editor = new EditorComponent("editor", "Type a prompt, /command, @file, or !shell...");
  const statusBar = new StatusBarComponent("status", defaultTheme.statusBarBg);

  // Scrollable region (fills remaining space above fixed bottom)
  tui.setScrollableContent(messages);

  // Fixed at bottom (top-to-bottom order: divider, editor, status bar).
  tui.addFixedBottom(divider);
  tui.addFixedBottom(editor);
  tui.addFixedBottom(statusBar);

  // Wire responsive layout providers
  const layoutProvider = () => tui.getLayout();
  editor.setLayoutProvider(layoutProvider);
  messages.setLayoutProvider(layoutProvider);
  statusBar.setLayoutProvider(layoutProvider);

  tui.setFocus(editor);

  return { tui, statusBar, messages, editor, divider, crewProgress };
}
