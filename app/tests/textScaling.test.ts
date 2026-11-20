import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("browser text scaling", () => {
  it("opts into OS text scaling without overriding the browser's root font size", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
    expect(html).toContain('<meta name="text-scale" content="scale" />');
    expect(css).not.toContain("font: 16px");
    expect(css).not.toContain("font-size:");
    expect(css).toContain("font-family: var(--sans)");
    expect(css).toContain("line-height: 1.5");
  });
});
