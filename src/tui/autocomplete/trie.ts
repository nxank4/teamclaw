/**
 * Trie for fast prefix-based autocomplete lookups.
 * Used for /commands, @agents, and file paths.
 */

class TrieNode {
  children = new Map<string, TrieNode>();
  values: string[] = [];
}

export class Trie {
  private root = new TrieNode();

  insert(word: string): void {
    let node = this.root;
    for (const ch of word.toLowerCase()) {
      let child = node.children.get(ch);
      if (!child) {
        child = new TrieNode();
        node.children.set(ch, child);
      }
      node = child;
    }
    node.values.push(word);
  }

  /** Remove all entries from the trie. */
  clear(): void {
    this.root = new TrieNode();
  }

  /** Find all entries matching a prefix, up to `limit` results. */
  search(prefix: string, limit = 10): string[] {
    let node = this.root;
    for (const ch of prefix.toLowerCase()) {
      const child = node.children.get(ch);
      if (!child) return [];
      node = child;
    }
    return this.collect(node, limit);
  }

  private collect(node: TrieNode, limit: number): string[] {
    const results: string[] = [];
    const stack: TrieNode[] = [node];

    while (stack.length > 0 && results.length < limit) {
      const current = stack.pop()!;
      for (const val of current.values) {
        results.push(val);
        if (results.length >= limit) return results;
      }
      // Push children in reverse alphabetical order so alphabetical comes out first
      const children = [...current.children.entries()].sort((a, b) => b[0].localeCompare(a[0]));
      for (const [, child] of children) {
        stack.push(child);
      }
    }

    return results;
  }
}
