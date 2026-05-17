import { describe, expect, it } from "bun:test";

import { generateSpecTemplate } from "../../src/spec/template.js";
import { splitFrontmatter } from "../../src/utils/frontmatter.js";
import { SpecFrontmatterSchema } from "../../src/spec/types.js";

describe("generateSpecTemplate", () => {
  it("produces frontmatter that validates against SpecFrontmatterSchema", () => {
    const raw = generateSpecTemplate("user-auth", new Date("2026-01-15T10:00:00Z"));
    const split = splitFrontmatter(raw);
    expect(split).not.toBeNull();
    const parsed = SpecFrontmatterSchema.parse(split?.frontmatter);
    expect(parsed.slug).toBe("user-auth");
    expect(parsed.status).toBe("draft");
    expect(parsed.created).toBe("2026-01-15T10:00:00.000Z");
    expect(parsed.last_updated).toBe(parsed.created);
  });

  it("includes the canonical eight section headings", () => {
    const raw = generateSpecTemplate("billing");
    for (const heading of [
      "## Summary",
      "## Goals",
      "## Non-Goals",
      "## User Workflow",
      "## API Surface",
      "## Data Contracts",
      "## Success Criteria",
      "## Open Questions",
    ]) {
      expect(raw).toContain(heading);
    }
  });
});
