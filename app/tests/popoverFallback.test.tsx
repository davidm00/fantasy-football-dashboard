import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SelectField from "../src/components/shared/SelectField";
import MetricTooltip from "../src/components/shared/MetricTooltip";

vi.mock("../src/hooks/usePopoverSupport", () => ({ usePopoverSupport: () => false }));

describe("browsers without Popover", () => {
  it("uses a labeled native select with the same options and selected value", () => {
    const markup = renderToStaticMarkup(<SelectField label="Season" value="2026" onChange={() => {}}
      options={[{ value: "2025", label: "2025" }, { value: "2026", label: "2026" }]} />);
    expect(markup).toContain("<label");
    expect(markup).toContain("<select");
    expect(markup).toContain('<option value="2026" selected="">2026</option>');
    expect(markup).not.toContain('role="listbox"');
    expect(markup).not.toContain("popover=");
  });

  it("preserves an invalid shared selection rather than displaying a valid-looking default", () => {
    const markup = renderToStaticMarkup(<SelectField label="Season" value="missing" onChange={() => {}}
      options={[{ value: "2026", label: "2026" }]} />);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("Unavailable selection");
  });

  it("keeps the explanation closed initially without relying on popover UA styles", () => {
    const markup = renderToStaticMarkup(<MetricTooltip label="Efficiency">Explanation text.</MetricTooltip>);
    expect(markup).toContain("metric-tooltip-fallback");
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("popover=");
    expect(markup).not.toContain("popoverTarget=");
  });
});
