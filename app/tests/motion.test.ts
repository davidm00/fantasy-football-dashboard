import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/Styles.css", import.meta.url), "utf8");

describe("motion preferences", () => {
  it("opts loading motion in and bounds automatic motion below five seconds", () => {
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("animation: route-pending-slide 900ms ease-in-out 4;");
    expect(css).not.toContain("animation: route-pending-slide 900ms ease-in-out infinite;");
  });

  it("does not use a global near-zero animation duration that can break completion logic", () => {
    expect(css).not.toContain("animation-duration: 0.01ms");
  });
});
