/**
 * Root TUI controller — manages the component tree, render loop,
 * focus management, and input routing.
 */
import { Container, type Component } from "./component.js";
import { DiffRenderer } from "./renderer.js";
import { InputParser, type KeyEvent } from "./input.js";
import { ProcessTerminal, type Terminal } from "./terminal.js";
import { hideCursor, showCursor } from "./ansi.js";

export class TUI {
  private terminal: Terminal;
  private renderer: DiffRenderer;
  private root: Container;
  private inputParser: InputParser;
  private focusedComponent: Component | null = null;
  private overlayComponent: Component | null = null;
  private renderPending = false;
  private running = false;

  /** Called when the TUI exits (Ctrl+C or stop()). */
  onExit?: () => void;

  constructor(terminal?: Terminal) {
    this.terminal = terminal ?? new ProcessTerminal();
    this.renderer = new DiffRenderer();
    this.root = new Container("__root__");
    this.inputParser = new InputParser();
    this.inputParser.onEvent = this.handleEvent.bind(this);
  }

  /** Start the TUI — enable terminal, begin input handling and render loop. */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.terminal.start();
    this.terminal.write(hideCursor);

    this.terminal.onInput((data: Buffer) => {
      this.inputParser.feed(data);
    });

    this.terminal.onResize(() => {
      this.renderer.reset();
      this.requestRender();
    });

    this.requestRender();
  }

  /** Stop the TUI — restore terminal, cleanup. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.terminal.write(showCursor);
    this.terminal.stop();
  }

  /** Add a child component to the root container. */
  addChild(component: Component): void {
    this.root.add(component);
    this.requestRender();
  }

  /** Remove a child component by ID. */
  removeChild(id: string): boolean {
    const removed = this.root.remove(id);
    if (removed) this.requestRender();
    return removed;
  }

  /** Get a child component by ID. */
  getChild(id: string): Component | undefined {
    return this.root.get(id);
  }

  /** Get the root container. */
  getRoot(): Container {
    return this.root;
  }

  /** Set keyboard focus to a component. */
  setFocus(component: Component | null): void {
    if (this.focusedComponent === component) return;
    if (this.focusedComponent?.onBlur) {
      this.focusedComponent.onBlur();
    }
    this.focusedComponent = component;
    if (component?.onFocus) {
      component.onFocus();
    }
    this.requestRender();
  }

  /** Get the currently focused component. */
  getFocus(): Component | null {
    return this.focusedComponent;
  }

  /** Show a modal overlay (takes all input, renders on top of root). */
  showOverlay(component: Component): void {
    this.overlayComponent = component;
    component.onMount?.();
    this.requestRender();
  }

  /** Hide the current overlay. */
  hideOverlay(): void {
    if (this.overlayComponent) {
      this.overlayComponent.onUnmount?.();
      this.overlayComponent = null;
      this.renderer.reset(); // Force full re-render to clear overlay
      this.requestRender();
    }
  }

  /** Check if an overlay is currently shown. */
  hasOverlay(): boolean {
    return this.overlayComponent !== null;
  }

  /**
   * Request a render on the next tick.
   * Multiple calls within the same tick are coalesced into a single render.
   */
  requestRender(): void {
    if (this.renderPending || !this.running) return;
    this.renderPending = true;
    process.nextTick(() => {
      this.renderPending = false;
      if (!this.running) return;
      this.doRender();
    });
  }

  /** Get terminal dimensions. */
  getTerminal(): Terminal {
    return this.terminal;
  }

  private doRender(): void {
    const width = this.terminal.columns;
    const lines = this.overlayComponent
      ? this.overlayComponent.render(width)
      : this.root.render(width);
    this.renderer.render(this.terminal, lines);
  }

  private handleEvent(event: KeyEvent): void {
    // Ctrl+C — always exit
    if (event.type === "char" && event.ctrl && event.char === "c") {
      this.stop();
      this.onExit?.();
      return;
    }

    // Route input: overlay → focused component → unhandled
    const target = this.overlayComponent ?? this.focusedComponent;
    if (target?.onKey?.(event)) {
      this.requestRender();
      return;
    }

    // Tab to cycle focus (if no overlay and not handled by focused component)
    if (event.type === "tab" && !this.overlayComponent) {
      this.cycleFocus(event.shift);
      return;
    }
  }

  /** Cycle focus to the next/previous focusable component. */
  private cycleFocus(reverse: boolean): void {
    const focusable = this.root.children.filter((c) => c.focusable);
    if (focusable.length === 0) return;

    const currentIdx = this.focusedComponent
      ? focusable.indexOf(this.focusedComponent)
      : -1;

    let nextIdx: number;
    if (reverse) {
      nextIdx = currentIdx <= 0 ? focusable.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= focusable.length - 1 ? 0 : currentIdx + 1;
    }

    this.setFocus(focusable[nextIdx]!);
  }
}
