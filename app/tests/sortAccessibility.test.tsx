import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SortHeader from "../src/components/shared/SortHeader";

describe("sortable table header semantics", () => {
  it("announces only the active sorted column while retaining every header button", () => {
    const markup = renderToStaticMarkup(<table><thead><tr>
      <SortHeader label="Name" sortKey="name" activeKey="points" direction="descending" onSort={() => {}} />
      <SortHeader label="Points" sortKey="points" activeKey="points" direction="descending" onSort={() => {}} />
    </tr></thead></table>);
    expect(markup.match(/aria-sort=/g)).toHaveLength(1);
    expect(markup).toContain('aria-sort="descending"');
    expect(markup).not.toContain('aria-sort="none"');
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup.match(/scope="col"/g)).toHaveLength(2);
  });
});
