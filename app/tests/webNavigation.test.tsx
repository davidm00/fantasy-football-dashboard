import { describe, expect, it } from "vitest";
import { renderRoute } from "./fixtures";
import Root from "../src/routes/Root";

describe("keyboard route navigation", () => {
  it("provides a skip link before repeated navigation and an outlet target", () => {
    const markup = renderRoute(Root);
    expect(markup).toContain('href="#page-content"');
    expect(markup).toContain('id="page-content"');
    expect(markup.indexOf("Skip to main content")).toBeLessThan(markup.indexOf('class="app-nav"'));
  });
});
