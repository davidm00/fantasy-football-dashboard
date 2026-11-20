import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { useTableSort } from "../src/hooks/useTableSort";
import type { SortDirection } from "../src/components/shared/SortHeader";

describe("immutable table sorting", () => {
  it.each(["ascending", "descending"] as const)("preserves source rows, stable ties and nulls last (%s)", (direction) => {
    const rows = [
      { id: "missing", value: null },
      { id: "first", value: 2 },
      { id: "low", value: 1 },
      { id: "second", value: 2 },
    ];
    const original = rows.slice();
    Object.freeze(rows);
    function Table({ direction }: { direction: SortDirection }) {
      const sorted = useTableSort(rows, { value: { value: (row) => row.value } },
        { key: "value", direction }, "");
      expect(sorted.rows).not.toBe(rows);
      return <output>{sorted.rows.map(({ id }) => id).join(",")}</output>;
    }
    const markup = renderToStaticMarkup(<MemoryRouter><Table direction={direction} /></MemoryRouter>);
    expect(markup).toContain(direction === "ascending"
      ? "low,first,second,missing" : "first,second,low,missing");
    expect(rows).toEqual(original);
  });
});
