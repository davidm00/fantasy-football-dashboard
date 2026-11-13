import MetricTooltip from "./MetricTooltip";

export type SortDirection = "ascending" | "descending";

export function SortButton({ label, active, direction, onClick }: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return <button type="button" onClick={onClick}>
    {label}{active && <span aria-hidden="true">{direction === "descending" ? "↓" : "↑"}</span>}
  </button>;
}

export default function SortHeader<Key extends string>({
  label, sortKey, activeKey, direction, align = "right", tooltip, onSort,
}: {
  label: string;
  sortKey: Key;
  activeKey: Key;
  direction: SortDirection;
  align?: "left" | "right";
  tooltip?: string;
  onSort: (key: Key) => void;
}) {
  const isActive = sortKey === activeKey;
  return <th scope="col" className={`season-sort-heading season-align-${align}`}
    aria-sort={isActive ? direction : "none"}>
    <span className="season-sort-control">
      <SortButton label={label} active={isActive} direction={direction} onClick={() => onSort(sortKey)} />
      {tooltip && <MetricTooltip label={label}>{tooltip}</MetricTooltip>}
    </span>
  </th>;
}
