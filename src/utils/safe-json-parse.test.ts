import { describe, it, expect } from "bun:test";
import { safeJsonParse } from "./safe-json-parse.js";

describe("safeJsonParse — XML tag stripping (CodeQL #52)", () => {
  it("does not leave a reformed <script> tag after sanitization", () => {
    const noisy = `<scr<script>ipt>{"hello":"world"}</scr<script>ipt>`;
    const result = safeJsonParse<{ hello: string }>(noisy);
    expect(result.parsed).toBe(true);
    if (result.parsed) expect(result.data.hello).toBe("world");
  });

  it("strips simple XML wrappers around JSON", () => {
    const result = safeJsonParse<{ ok: boolean }>(`<wrapper>{"ok":true}</wrapper>`);
    expect(result.parsed).toBe(true);
    if (result.parsed) expect(result.data.ok).toBe(true);
  });
});
