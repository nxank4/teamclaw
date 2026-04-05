/**
 * OpenPawl TUI Framework — public API.
 *
 * A standalone, zero-dependency terminal UI library.
 * Uses line-based retained-mode rendering with CSI 2026 synchronized output.
 */

// Core
export { TUI } from "./core/tui.js";
export { type Terminal, ProcessTerminal, VirtualTerminal } from "./core/terminal.js";
export { DiffRenderer } from "./core/renderer.js";
export { type Component, Container } from "./core/component.js";
export { InputParser, type KeyEvent } from "./core/input.js";
export { SelectionManager, type Selection } from "./core/selection.js";
export * as ansi from "./core/ansi.js";

// Components
export { TextComponent } from "./components/text.js";
export { DividerComponent } from "./components/divider.js";
export { SpinnerComponent } from "./components/spinner.js";
export { StatusBarComponent, type StatusSegment } from "./components/status-bar.js";
export { SelectListComponent, type SelectItem } from "./components/select-list.js";
export { MessagesComponent, type ChatMessage } from "./components/messages.js";
export { EditorComponent, type AutocompleteProvider, type AutocompleteSuggestion } from "./components/editor.js";
export { MarkdownComponent, renderMarkdown } from "./components/markdown.js";
export { OverlayComponent } from "./components/overlay.js";

// Slash commands
export { CommandRegistry, type SlashCommand, type CommandContext } from "./slash/registry.js";
export { parseInput, type ParsedInput } from "./slash/parser.js";
export { createBuiltinCommands } from "./slash/builtin.js";

// Themes
export { type Theme, type StyleFn } from "./themes/theme.js";
export { defaultTheme } from "./themes/default.js";

// Keyboard
export { KeybindingManager, type KeyContext } from "./keyboard/keybindings.js";
export { ACTIONS, type ActionId } from "./keyboard/actions.js";
export { PRESETS, type PresetName, type KeymapPreset } from "./keyboard/keymap-presets.js";

// Utils
export { visibleWidth, charWidth, stripAnsi } from "./utils/text-width.js";
export { truncate } from "./utils/truncate.js";
export { wrapText } from "./utils/wrap.js";
