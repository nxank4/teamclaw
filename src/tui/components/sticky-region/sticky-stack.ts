/**
 * Internal FIFO queue of sticky blocks. Only the head is "visible";
 * everything else waits. Consumers receive a stable handle on mount,
 * so calling update() / complete() on a queued block mutates queued
 * state — the block surfaces with whatever its content is at promote-time.
 */
import type { StickyBlockContent } from "./sticky-block.js";

export interface QueueEntry {
  /** Current displayed (or pending) content. Mutable via handle.update(). */
  content: StickyBlockContent;
  /** When true, the block was unmounted before promotion — skip on dequeue. */
  cancelled: boolean;
  /** Stable identity so handles can find their entry after queue moves. */
  readonly id: number;
}

export class StickyStack {
  private entries: QueueEntry[] = [];
  private nextId = 1;

  /** Push a new entry. Returns its id. */
  enqueue(content: StickyBlockContent): QueueEntry {
    const entry: QueueEntry = { content, cancelled: false, id: this.nextId++ };
    this.entries.push(entry);
    return entry;
  }

  /** Currently-visible entry (head of queue), skipping cancelled ones. */
  head(): QueueEntry | null {
    for (const e of this.entries) {
      if (!e.cancelled) return e;
    }
    return null;
  }

  /** Remove the head and return it. */
  shift(): QueueEntry | null {
    while (this.entries.length > 0) {
      const e = this.entries.shift()!;
      if (!e.cancelled) return e;
    }
    return null;
  }

  /** Mark an entry as cancelled in place. It will be skipped on dequeue. */
  cancel(id: number): void {
    for (const e of this.entries) {
      if (e.id === id) {
        e.cancelled = true;
        return;
      }
    }
  }

  /** Total live entries (excludes cancelled). */
  size(): number {
    let n = 0;
    for (const e of this.entries) if (!e.cancelled) n++;
    return n;
  }

  /** Remove every entry. Used on teardown / tests. */
  clear(): void {
    this.entries.length = 0;
  }
}
