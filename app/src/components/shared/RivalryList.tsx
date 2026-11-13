import { useTableSort } from "../../hooks/useTableSort";
import { recordText, type getManagerRivals } from "../../utils/managerMetrics";
import { SortButton } from "./SortHeader";
import RivalryRecord from "./RivalryRecord";

export default function RivalryList({ managerName, rivals, selectedId, href, showVersus = false }: {
  managerName: string;
  rivals: ReturnType<typeof getManagerRivals>;
  selectedId?: string | null;
  href: (opponentId: string) => string;
  showVersus?: boolean;
}) {
  const sorter = useTableSort([...rivals].sort((a, b) => a.name.localeCompare(b.name)), {
    name: { value: (row) => row.name },
    record: { value: (row) => (row.wins + row.ties / 2) / row.games, direction: "descending" },
    games: { value: (row) => row.games, direction: "descending" },
  }, { key: "name", direction: "ascending" }, "rival");
  return <div className="rivalry-list-view">
    <div className="rivalry-list-sort"><span>Sort opponents</span>
      {[["name", "Name"], ["record", "Win %"], ["games", "Meetings"]].map(([key, label]) => <SortButton key={key} label={label}
        active={sorter.key === key} direction={sorter.direction} onClick={() => sorter.onSort(key)} />)}
      <button type="button" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>
    </div>
    <ul className="rivalry-list">{sorter.rows.map((rival) => <li key={rival.id}>
      <span><strong>{showVersus ? `vs ${rival.name}` : rival.name}</strong><small>{rival.games} {rival.games === 1 ? "meeting" : "meetings"}</small></span>
      <RivalryRecord record={rival} to={href(rival.id)} label={`${managerName} vs ${rival.name}: ${recordText(rival)}; show every meeting`}
        selected={selectedId === rival.id} />
    </li>)}</ul>
    {!rivals.length && <p className="activity-empty">No finalized meetings match this scope and manager filter.</p>}
  </div>;
}
