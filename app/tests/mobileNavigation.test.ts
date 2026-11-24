import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/Styles.css", import.meta.url), "utf8");

describe("mobile navigation painting", () => {
  it("uses an opaque unfiltered header when navigation scrolls with the page", () => {
    const mobileHeader = css.match(/@media \(max-width: 720px\)\s*\{\s*\.app-nav\s*\{([^}]+)\}/)?.[1];
    expect(mobileHeader).toBeDefined();
    expect(mobileHeader).toContain("position: static;");
    expect(mobileHeader).toContain("background: var(--surface);");
    expect(mobileHeader).toContain("backdrop-filter: none;");
  });
});
