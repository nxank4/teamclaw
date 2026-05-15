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
  const crewProgress = new CrewProgressView("crew-progress", {
    state: createCrewRunState(""),
    spinnerFrame: 0,
  });
  crewProgress.hidden = true;
  const divider = new DividerComponent("divider");
  const editor = new EditorComponent("editor", "Type a prompt, /command, @file, or !shell...");
  const statusBar = new StatusBarComponent("status", defaultTheme.statusBarBg);

  // Scrollable region (fills remaining space above fixed bottom)
  tui.setScrollableContent(messages);

  // Fixed at bottom (top-to-bottom order: crew progress, divider, editor, status bar).
  // crewProgress sits above the divider so the live agent tree always reads as part of the
  // overlay region. Solo mode keeps it hidden via tui.setFixedBottomHidden.
  tui.addFixedBottom(crewProgress);
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
