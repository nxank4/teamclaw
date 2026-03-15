import { describe, it, expect } from "vitest";
import { extractFileBlocks } from "../src/utils/file-block-parser.js";

describe("extractFileBlocks", () => {
  it("extracts file from fence info with language and filename", () => {
    const input = "```javascript index.js\nconsole.log('hi');\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toEqual([
      { filename: "index.js", content: "console.log('hi');\n" },
    ]);
  });

  it("extracts file from fence info with path-style filename", () => {
    const input = "```typescript src/app.ts\nconst x = 1;\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toEqual([
      { filename: "src/app.ts", content: "const x = 1;\n" },
    ]);
  });

  it("extracts file from XML marker", () => {
    const input = "<!-- FILE: utils/helper.js -->\n```js\nmodule.exports = {};\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toEqual([
      { filename: "utils/helper.js", content: "module.exports = {};\n" },
    ]);
  });

  it("extracts file from bold backtick pattern", () => {
    const input = "**`config.json`**\n```json\n{}\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toEqual([
      { filename: "config.json", content: "{}\n" },
    ]);
  });

  it("extracts file from backtick-colon pattern", () => {
    const input = "\n`style.css`:\n```css\nbody { margin: 0; }\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toEqual([
      { filename: "style.css", content: "body { margin: 0; }\n" },
    ]);
  });

  it("ignores fenced blocks without a filename", () => {
    const input = "```\nsome plain text\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toEqual([]);
  });

  it("extracts multiple file blocks", () => {
    const input = [
      "```javascript index.js",
      "console.log('a');",
      "```",
      "",
      "```css styles.css",
      "body {}",
      "```",
    ].join("\n");
    const blocks = extractFileBlocks(input);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].filename).toBe("index.js");
    expect(blocks[1].filename).toBe("styles.css");
  });

  it("strips leading slashes and traversal from filenames", () => {
    const input = "```js /../../etc/config.json\nmalicious\n```";
    const blocks = extractFileBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].filename).toBe("etc/config.json");
  });
});
